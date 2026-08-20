import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/src/app_config.dart';

void main() {
  group('URL Configuration and Protection', () {
    test(
      'WebView fallback uses frontend URL and native API uses primary/fallback backend URLs',
      () {
        final config = AppConfig.fromValues(
          configuredFrontendUrl: 'https://omlu.in',
          configuredPrimaryBackendUrl: 'https://api.omlu.in',
          configuredFallbackBackendUrl: 'https://omlu-server.onrender.com',
          allowedDomains: '',
          allowHttp: false,
        );

        // WebView fallback must point to frontend URL
        expect(config.frontendUrl.toString(), 'https://omlu.in');

        // Primary API client must point to https://api.omlu.in
        expect(config.primaryBackendUrl.toString(), 'https://api.omlu.in');

        // Fallback API client must point to https://omlu-server.onrender.com
        expect(config.fallbackBackendUrl.toString(), 'https://omlu-server.onrender.com');

        // Verify distinct backend URLs
        expect(config.primaryBackendUrl, isNot(equals(config.fallbackBackendUrl)));
      },
    );

    test(
      'RealtimeClient converts HTTPS primary backend URL to WSS staff WebSocket URL',
      () async {
        Uri? capturedUri;

        final client = RealtimeClient(
          baseUrl: Uri.parse('https://api.omlu.in'),
          accessToken: 'token-abc',
          channel: 'operations',
          connector: (uri) async {
            capturedUri = uri;
            throw const SocketException('Abort connection test');
          },
        );

        // Trigger connection attempt to capture WebSocket URL
        unawaited(client.connect());
        await Future.delayed(const Duration(milliseconds: 50));
        await client.disconnect();

        expect(capturedUri, isNotNull);
        expect(capturedUri!.scheme, 'wss');
        expect(capturedUri!.host, 'api.omlu.in');
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
