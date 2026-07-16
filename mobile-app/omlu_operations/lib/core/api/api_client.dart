import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'api_exceptions.dart';

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
  }) : _baseUrl = baseUrl,
       _accessToken = accessToken,
       _timeout = timeout,
       _transport = transport ?? _dartIoTransport;

  final Uri _baseUrl;
  final Duration _timeout;
  final ApiTransport _transport;
  String? _accessToken;

  set accessToken(String? value) => _accessToken = value;

  Uri get baseUrl => _baseUrl;

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
    final uri = _baseUrl.replace(
      path: _joinPath(_baseUrl.path, path),
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
      return response;
    } on TimeoutException {
      throw const ApiTimeoutException('The request timed out.');
    } on SocketException catch (error) {
      throw ApiException('Network request failed.', details: error.message);
    }
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
