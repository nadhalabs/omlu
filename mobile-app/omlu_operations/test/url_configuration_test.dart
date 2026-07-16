import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/src/app_config.dart';
import 'dart:io';

void main() {
  group('URL Configuration and Protection', () {
    test(
      'WebView fallback uses frontend URL and native API uses backend URL',
      () {
        final config = AppConfig.fromValues(
          configuredFrontendUrl: 'https://omlu.vercel.app',
          configuredBackendUrl: 'https://omlu-api.onrender.com',
          allowedDomains: '',
          allowHttp: false,
        );

        // WebView fallback must point to frontend Vercel URL
        expect(config.frontendUrl.toString(), 'https://omlu.vercel.app');

        // Native API client must point to Render backend URL
        expect(config.backendUrl.toString(), 'https://omlu-api.onrender.com');

        // Verify that they are distinct
        expect(config.frontendUrl, isNot(equals(config.backendUrl)));
      },
    );

    test(
      'RealtimeClient converts HTTPS backend URL to WSS staff WebSocket URL',
      () async {
        Uri? capturedUri;

        final client = RealtimeClient(
          baseUrl: Uri.parse('https://omlu-api.onrender.com'),
          accessToken: 'token-abc',
          channel: 'operations',
          connector: (uri) async {
            capturedUri = uri;
            throw const SocketException('Abort connection test');
          },
        );

        // Trigger connection attempt to capture WebSocket URL (run asynchronously to avoid connecting loops)
        unawaited(client.connect());
        await Future.delayed(const Duration(milliseconds: 50));
        await client.disconnect();

        expect(capturedUri, isNotNull);
        expect(capturedUri!.scheme, 'wss');
        expect(capturedUri!.host, 'omlu-api.onrender.com');
        expect(capturedUri!.path, '/ws/staff');
        expect(capturedUri!.queryParameters['token'], 'token-abc');
        expect(capturedUri!.queryParameters['channel'], 'operations');
      },
    );

    test(
      'ApiClient throws typed ApiException on non-JSON response without logging tokens/passwords',
      () async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        server.listen((request) {
          request.response.statusCode = 200;
          request.response.headers.contentType = ContentType.html;
          request.response.write(
            '<!DOCTYPE html><html><body>Error page</body></html>',
          );
          request.response.close();
        });

        final client = ApiClient(
          baseUrl: Uri.parse('http://${server.address.host}:${server.port}'),
        );

        try {
          await expectLater(
            () => client.getJson('/staff/tables'),
            throwsA(
              isA<ApiException>().having(
                (e) => e.message,
                'message',
                allOf(
                  contains('Non-JSON response received. Status: 200'),
                  contains('Content-Type: text/html'),
                  isNot(contains('<!DOCTYPE html>')),
                ),
              ),
            ),
          );
        } finally {
          await server.close(force: true);
        }
      },
    );
  });
}
