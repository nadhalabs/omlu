import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/src/app_config.dart';

void main() {
  group('AppConfig', () {
    test('uses default frontend, primary backend, and fallback backend defaults', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: AppConfig.fallbackFrontendUrl,
        configuredPrimaryBackendUrl: AppConfig.defaultPrimaryBackendUrl,
        configuredFallbackBackendUrl: AppConfig.defaultFallbackBackendUrl,
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.frontendUrl.toString(), 'https://omlu.in');
      expect(config.primaryBackendUrl.toString(), 'https://api.omlu.in');
      expect(config.fallbackBackendUrl.toString(), 'https://omlu-server.onrender.com');
      expect(config.backendUrl.toString(), 'https://api.omlu.in');
    });

    test('normalizes trailing slashes correctly', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: 'https://omlu.in/',
        configuredPrimaryBackendUrl: 'https://api.omlu.in///',
        configuredFallbackBackendUrl: 'https://omlu-server.onrender.com///',
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.frontendUrl.toString(), 'https://omlu.in');
      expect(config.primaryBackendUrl.toString(), 'https://api.omlu.in');
      expect(config.fallbackBackendUrl.toString(), 'https://omlu-server.onrender.com');
    });

    test('rejects HTTP unless explicitly allowed for development', () {
      expect(
        () => AppConfig.fromValues(
          configuredFrontendUrl: 'http://10.0.2.2:3000',
          configuredPrimaryBackendUrl: 'https://api.omlu.in',
          configuredFallbackBackendUrl: 'https://omlu-server.onrender.com',
          allowedDomains: '',
          allowHttp: false,
        ),
        throwsArgumentError,
      );
    });

    test('allows configured official domains only', () {
      final config = AppConfig.fromValues(
        configuredFrontendUrl: 'https://omlu.example',
        configuredPrimaryBackendUrl: 'https://api.omlu.example',
        configuredFallbackBackendUrl: 'https://fallback.omlu.example',
        allowedDomains: 'admin.omlu.example,kitchen.omlu.example',
        allowHttp: false,
      );

      expect(
        config.isAllowedInWebView(Uri.parse('https://omlu.example/admin')),
        true,
      );
      expect(
        config.isAllowedInWebView(Uri.parse('https://api.omlu.example')),
        true,
      );
      expect(
        config.isAllowedInWebView(Uri.parse('https://fallback.omlu.example')),
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
