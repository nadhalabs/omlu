import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/src/app_config.dart';

void main() {
  group('AppConfig', () {
    test('uses default frontend and backend fallbacks', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: AppConfig.fallbackFrontendUrl,
        configuredBackendUrl: AppConfig.fallbackBackendUrl,
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.frontendUrl.toString(), AppConfig.fallbackFrontendUrl);
      expect(config.backendUrl.toString(), AppConfig.fallbackBackendUrl);
    });

    test('normalizes trailing slashes correctly', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: 'https://omlu.vercel.app/',
        configuredBackendUrl: 'https://omlu-api.onrender.com///',
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.frontendUrl.toString(), 'https://omlu.vercel.app');
      expect(config.backendUrl.toString(), 'https://omlu-api.onrender.com');
    });

    test('rejects HTTP unless explicitly allowed for development', () {
      expect(
        () => AppConfig.fromValues(
          configuredFrontendUrl: 'http://10.0.2.2:3000',
          configuredBackendUrl: 'https://omlu-api.onrender.com',
          allowedDomains: '',
          allowHttp: false,
        ),
        throwsArgumentError,
      );
    });

    test('allows configured official domains only', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: 'https://omlu.example',
        configuredBackendUrl: 'https://omlu-api.example',
        allowedDomains: 'admin.omlu.example,kitchen.omlu.example',
        allowHttp: false,
      );

      expect(
        config.isAllowedInWebView(Uri.parse('https://omlu.example/admin')),
        true,
      );
      expect(
        config.isAllowedInWebView(Uri.parse('https://omlu-api.example')),
        true,
      );
      expect(
        config.isAllowedInWebView(Uri.parse('https://admin.omlu.example')),
        true,
      );
      expect(
        config.isAllowedInWebView(Uri.parse('https://evil.example')),
        false,
      );
    });
  });
}
