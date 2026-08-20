import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'api_exceptions.dart';
import 'backend_selection_manager.dart';
import '../auth/native_auth_runtime.dart';

class ApiRequest {
  const ApiRequest({
    required this.method,
    required this.uri,
    required this.headers,
    this.body,
  });

  final String method;
  final Uri uri;
  final Map<String, String> headers;
  final Object? body;
}

class ApiResponse {
  const ApiResponse({
    required this.statusCode,
    required this.body,
    this.headers = const {},
  });

  final int statusCode;
  final Object? body;
  final Map<String, String> headers;
}

typedef ApiTransport = Future<ApiResponse> Function(ApiRequest request);

class ApiClient {
  ApiClient({
    required Uri baseUrl,
    String? accessToken,
    Duration timeout = const Duration(seconds: 20),
    ApiTransport? transport,
    NativeAuthRuntime? authRuntime,
    BackendSelectionManager? backendSelectionManager,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken,
        _timeout = timeout,
        _transport = transport ?? _dartIoTransport,
        _authRuntime = authRuntime,
        _backendSelectionManager = backendSelectionManager;

  final Uri _baseUrl;
  final Duration _timeout;
  final ApiTransport _transport;
  final NativeAuthRuntime? _authRuntime;
  final BackendSelectionManager? _backendSelectionManager;
  String? _accessToken;
  Future<void> Function(NativeAuthorityLease lease)? onAuthenticationInvalid;

  set accessToken(String? value) => _accessToken = value;

  Uri get baseUrl =>
      _backendSelectionManager?.activeBackendUrl ?? _baseUrl;

  BackendSelectionManager? get backendSelectionManager =>
      _backendSelectionManager;

  Future<Map<String, Object?>> getJson(
    String path, {
    Map<String, String> query = const {},
  }) async {
    final response = await _send('GET', path, query: query);
    return _expectObject(response.body);
  }

  Future<List<Object?>> getList(
    String path, {
    Map<String, String> query = const {},
  }) async {
    final response = await _send('GET', path, query: query);
    return _expectList(response.body);
  }

  Future<Map<String, Object?>> postJson(
    String path, {
    Object? body,
    String? idempotencyKey,
  }) async {
    final response = await _send(
      'POST',
      path,
      body: body,
      idempotencyKey: idempotencyKey,
    );
    return _expectObject(response.body);
  }

  Future<Map<String, Object?>> patchJson(String path, {Object? body}) async {
    final response = await _send('PATCH', path, body: body);
    return _expectObject(response.body);
  }

  Future<ApiResponse> _send(
    String method,
    String path, {
    Object? body,
    String? idempotencyKey,
    Map<String, String> query = const {},
  }) async {
    final runtime = _authRuntime;
    final authenticated = _accessToken != null;
    final isAuthorityBootstrap =
        path == '/auth/staff/me' || path == '/auth/staff/logout';
    NativeAuthorityLease? lease;
    if (authenticated && runtime != null && runtime.isActive) {
      lease = runtime.capture();
    } else if (authenticated && runtime != null && !isAuthorityBootstrap) {
      throw StateError('Authenticated request blocked until /me validation.');
    }

    final currentBaseUrl = baseUrl;
    final uri = currentBaseUrl.replace(
      path: _joinPath(currentBaseUrl.path, path),
      queryParameters: query.isEmpty ? null : query,
    );
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      ...?(_accessToken == null
          ? null
          : {'Authorization': 'Bearer $_accessToken'}),
      ...?(idempotencyKey == null ? null : {'Idempotency-Key': idempotencyKey}),
    };

    final isWrite = method.toUpperCase() != 'GET';

    try {
      final response = await _transport(
        ApiRequest(method: method, uri: uri, headers: headers, body: body),
      ).timeout(_timeout);

      // Server was reached and responded with an HTTP status code.
      // Do NOT trigger backend fallback for any HTTP status response (2xx, 4xx, 5xx).
      if (response.statusCode == 401 && lease != null) {
        if (runtime!.isCurrent(lease)) {
          await onAuthenticationInvalid?.call(lease);
        }
      }

      _throwForStatus(response);
      if (lease != null) runtime!.ensureCurrent(lease);
      return response;
    } on TimeoutException catch (error) {
      return _handleTransportError(
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        query: query,
        lease: lease,
        isWrite: isWrite,
        error: error,
        exceptionToThrow: const ApiTimeoutException('The request timed out.'),
      );
    } on SocketException catch (error) {
      return _handleTransportError(
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        query: query,
        lease: lease,
        isWrite: isWrite,
        error: error,
        exceptionToThrow: ApiException('Network request failed.', details: error.message),
      );
    } on HttpException catch (error) {
      return _handleTransportError(
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        query: query,
        lease: lease,
        isWrite: isWrite,
        error: error,
        exceptionToThrow: ApiException('HTTP connection error.', details: error.message),
      );
    } on HandshakeException catch (error) {
      return _handleTransportError(
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        query: query,
        lease: lease,
        isWrite: isWrite,
        error: error,
        exceptionToThrow: ApiException('TLS handshake failed.', details: error.message),
      );
    } catch (error) {
      if (error is ApiException) {
        rethrow;
      }
      return _handleTransportError(
        method: method,
        path: path,
        body: body,
        idempotencyKey: idempotencyKey,
        query: query,
        lease: lease,
        isWrite: isWrite,
        error: error,
        exceptionToThrow: error is Exception ? error : ApiException(error.toString()),
      );
    }
  }

  Future<ApiResponse> _handleTransportError({
    required String method,
    required String path,
    required Object? body,
    required String? idempotencyKey,
    required Map<String, String> query,
    required NativeAuthorityLease? lease,
    required bool isWrite,
    required Object error,
    required Exception exceptionToThrow,
  }) async {
    final manager = _backendSelectionManager;

    // Activate fallback target for future requests if primary transport failed
    final targetChanged = manager != null && manager.isPrimary
        ? manager.activateFallback(error: error, reason: 'Transport failure on $method $path')
        : false;

    // REQUIREMENT 4: Mutating write requests are NEVER automatically retried on fallback to prevent duplicate execution.
    if (isWrite) {
      throw exceptionToThrow;
    }

    // For read-only GET requests: if target changed to fallback, retry ONCE on newly active fallback backend
    if (targetChanged && !isWrite) {
      final newBaseUrl = baseUrl;
      final uri = newBaseUrl.replace(
        path: _joinPath(newBaseUrl.path, path),
        queryParameters: query.isEmpty ? null : query,
      );
      final headers = <String, String>{
        'Accept': 'application/json',
        if (body != null) 'Content-Type': 'application/json',
        ...?(_accessToken == null
            ? null
            : {'Authorization': 'Bearer $_accessToken'}),
        ...?(idempotencyKey == null ? null : {'Idempotency-Key': idempotencyKey}),
      };
      try {
        final response = await _transport(
          ApiRequest(method: method, uri: uri, headers: headers, body: body),
        ).timeout(_timeout);
        _throwForStatus(response);
        if (lease != null) _authRuntime!.ensureCurrent(lease);
        return response;
      } catch (_) {
        throw exceptionToThrow;
      }
    }

    throw exceptionToThrow;
  }

  static String _joinPath(String basePath, String path) {
    final cleanBase = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return '$cleanBase$cleanPath';
  }

  static Map<String, Object?> _expectObject(Object? value) {
    if (value is Map<String, Object?>) return value;
    if (value is Map) return Map<String, Object?>.from(value);
    throw const ApiException('Expected a JSON object response.');
  }

  static List<Object?> _expectList(Object? value) {
    if (value is List<Object?>) return value;
    if (value is List) return List<Object?>.from(value);
    throw const ApiException('Expected a JSON array response.');
  }

  static void _throwForStatus(ApiResponse response) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    final detail = response.body is Map
        ? (response.body as Map)['detail']
        : null;
    final message = detail is String ? detail : 'Request failed.';
    switch (response.statusCode) {
      case 401:
        throw AuthenticationException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      case 403:
        throw PermissionDeniedException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      case 404:
        throw NotFoundException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      case 409:
        throw ConflictException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      case 422:
        throw ValidationException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      case 429:
        throw RateLimitException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
      default:
        throw ApiException(
          message,
          statusCode: response.statusCode,
          details: response.body,
        );
    }
  }

  static Future<ApiResponse> _dartIoTransport(ApiRequest request) async {
    final client = HttpClient();
    try {
      final httpRequest = await client.openUrl(request.method, request.uri);
      request.headers.forEach(httpRequest.headers.set);
      if (request.body != null) {
        httpRequest.write(jsonEncode(request.body));
      }
      final httpResponse = await httpRequest.close();
      final text = await utf8.decoder.bind(httpResponse).join();
      final contentType = httpResponse.headers.contentType?.value ?? '';

      if (text.isNotEmpty && !contentType.contains('application/json')) {
        throw ApiException(
          'Non-JSON response received. Status: ${httpResponse.statusCode}, URL: ${request.uri}, Content-Type: $contentType',
          statusCode: httpResponse.statusCode,
        );
      }

      final decoded = text.isEmpty ? null : jsonDecode(text);
      return ApiResponse(
        statusCode: httpResponse.statusCode,
        body: decoded,
        headers: _headersToMap(httpResponse.headers),
      );
    } finally {
      client.close(force: true);
    }
  }

  static Map<String, String> _headersToMap(HttpHeaders headers) {
    final mapped = <String, String>{};
    headers.forEach((name, values) {
      mapped[name] = values.join(',');
    });
    return mapped;
  }
}
