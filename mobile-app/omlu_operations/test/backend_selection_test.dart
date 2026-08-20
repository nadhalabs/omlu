import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/backend_selection_manager.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/src/app_config.dart';

void main() {
  group('Backend Selection & Fallback Architecture', () {
    test('1. primary backend defaults to https://api.omlu.in', () {
      final config = AppConfig.fromEnvironment();
      expect(config.primaryBackendUrl.toString(), 'https://api.omlu.in');
    });

    test('2. fallback backend equals https://omlu-server.onrender.com', () {
      final config = AppConfig.fromEnvironment();
      expect(config.fallbackBackendUrl.toString(), 'https://omlu-server.onrender.com');
    });

    test('3. primary REST URL resolution', () {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);
      expect(manager.activeBackendUrl.toString(), 'https://api.omlu.in');
      expect(manager.isPrimary, isTrue);
    });

    test('4. primary WebSocket resolves to wss://api.omlu.in', () {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);
      expect(manager.activeWsUri.toString(), 'wss://api.omlu.in');
    });

    test('5. fallback WebSocket resolves to wss://omlu-server.onrender.com', () {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);
      manager.activateFallback(reason: 'Test fallback');
      expect(manager.activeWsUri.toString(), 'wss://omlu-server.onrender.com');
      expect(manager.isFallback, isTrue);
    });

    test('6. connection failure can activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async {
          throw const SocketException('Connection refused');
        },
      );

      expect(manager.isPrimary, isTrue);

      try {
        await client.getJson('/test');
      } catch (_) {}

      expect(manager.isFallback, isTrue);
      expect(manager.activeBackendUrl.toString(), 'https://omlu-server.onrender.com');
    });

    test('7. HTTP 401 does NOT activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async => const ApiResponse(
          statusCode: 401,
          body: {'detail': 'Unauthorized'},
        ),
      );

      await expectLater(
        () => client.getJson('/test'),
        throwsA(isA<AuthenticationException>()),
      );

      expect(manager.isPrimary, isTrue);
      expect(manager.activeBackendUrl.toString(), 'https://api.omlu.in');
    });

    test('8. HTTP 403 does NOT activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async => const ApiResponse(
          statusCode: 403,
          body: {'detail': 'Forbidden'},
        ),
      );

      await expectLater(
        () => client.getJson('/test'),
        throwsA(isA<PermissionDeniedException>()),
      );

      expect(manager.isPrimary, isTrue);
    });

    test('9. HTTP 404 does NOT activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async => const ApiResponse(
          statusCode: 404,
          body: {'detail': 'Not Found'},
        ),
      );

      await expectLater(
        () => client.getJson('/test'),
        throwsA(isA<NotFoundException>()),
      );

      expect(manager.isPrimary, isTrue);
    });

    test('10. HTTP 422 does NOT activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async => const ApiResponse(
          statusCode: 422,
          body: {'detail': 'Unprocessable Entity'},
        ),
      );

      await expectLater(
        () => client.getJson('/test'),
        throwsA(isA<ValidationException>()),
      );

      expect(manager.isPrimary, isTrue);
    });

    test('11. HTTP 500 response from a reachable primary server does NOT automatically activate fallback', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async => const ApiResponse(
          statusCode: 500,
          body: {'detail': 'Internal Server Error'},
        ),
      );

      await expectLater(
        () => client.getJson('/test'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 500)),
      );

      expect(manager.isPrimary, isTrue);
      expect(manager.activeBackendUrl.toString(), 'https://api.omlu.in');
    });

    test('12. write request is not duplicated across both hosts', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      var attemptCount = 0;
      final requestedUris = <Uri>[];

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async {
          attemptCount++;
          requestedUris.add(request.uri);
          throw const SocketException('Connection timeout during POST');
        },
      );

      // Submit mutating POST write request
      await expectLater(
        () => client.postJson('/orders', body: {'item_id': 1}, idempotencyKey: 'idemp-999'),
        throwsA(isA<ApiException>()),
      );

      // Assert write attempt was executed EXACTLY ONCE and NOT retried
      expect(attemptCount, equals(1));
      expect(requestedUris.length, equals(1));
      expect(requestedUris.first.host, equals('api.omlu.in'));

      // Backend manager updated target to fallback for FUTURE requests
      expect(manager.isFallback, isTrue);
      expect(manager.activeBackendUrl.toString(), 'https://omlu-server.onrender.com');
    });

    test('13. existing idempotency behavior remains intact', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      late ApiRequest capturedRequest;

      final client = ApiClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        transport: (request) async {
          capturedRequest = request;
          return const ApiResponse(
            statusCode: 200,
            body: {'id': 123, 'status': 'created'},
          );
        },
      );

      final result = await client.postJson(
        '/orders',
        body: {'item_id': 1},
        idempotencyKey: 'idem-key-123',
      );

      expect(result['status'], equals('created'));
      expect(capturedRequest.headers['Idempotency-Key'], equals('idem-key-123'));
    });

    test('14. reconnecting after backend change does not leave stale WebSocket connections', () async {
      final config = AppConfig.fromEnvironment();
      final manager = BackendSelectionManager(config: config);

      final connectionUris = <Uri>[];
      var socketCloseCount = 0;

      final client = RealtimeClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        accessToken: 'token-ws',
        channel: 'operations',
        connector: (uri) async {
          connectionUris.add(uri);
          return _MockWebSocket(onClose: () => socketCloseCount++);
        },
      );

      await client.connect();
      expect(connectionUris.length, equals(1));
      expect(connectionUris.last.host, equals('api.omlu.in'));

      // Disconnect old client cleanly
      await client.disconnect();
      expect(socketCloseCount, greaterThanOrEqualTo(1));

      // Simulate target change and new client
      manager.activateFallback(reason: 'Primary network down');
      final fallbackClient = RealtimeClient(
        baseUrl: manager.activeBackendUrl,
        backendSelectionManager: manager,
        accessToken: 'token-ws',
        channel: 'operations',
        connector: (uri) async {
          connectionUris.add(uri);
          return _MockWebSocket(onClose: () => socketCloseCount++);
        },
      );

      await fallbackClient.connect();
      expect(connectionUris.length, equals(2));
      expect(connectionUris.last.host, equals('omlu-server.onrender.com'));

      await fallbackClient.disconnect();
      await fallbackClient.dispose();
      await client.dispose();
    });

    test('15. frontend remains https://omlu.in', () {
      final config = AppConfig.fromEnvironment();
      expect(config.frontendUrl.toString(), 'https://omlu.in');
    });
  });
}

class _MockWebSocket implements WebSocket {
  _MockWebSocket({this.onClose});

  final void Function()? onClose;

  @override
  Future<void> close([int? code, String? reason]) async {
    onClose?.call();
  }

  @override
  StreamSubscription<dynamic> listen(
    void Function(dynamic event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    // Return a dummy subscription that doesn't hang
    final controller = StreamController<dynamic>();
    unawaited(controller.close());
    return controller.stream.listen(onData, onError: onError, onDone: onDone, cancelOnError: cancelOnError);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
