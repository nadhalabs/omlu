import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/src/app_config.dart';

void main() {
  group('AppConfig', () {
    test('uses HTTPS fallback URL', () {
      final config = AppConfig.fromValues(
        configuredUrl: AppConfig.fallbackUrl,
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.initialUrl.toString(), AppConfig.fallbackUrl);
      expect(config.isAllowedInWebView(Uri.parse(AppConfig.fallbackUrl)), true);
    });

    test('rejects HTTP unless explicitly allowed for development', () {
      expect(
        () => AppConfig.fromValues(
          configuredUrl: 'http://10.0.2.2:3000',
          allowedDomains: '',
          allowHttp: false,
        ),
        throwsArgumentError,
      );
    });

    test('allows configured official domains only', () {
      final config = AppConfig.fromValues(
        configuredUrl: 'https://omlu.example',
        allowedDomains: 'admin.omlu.example,kitchen.omlu.example',
        allowHttp: false,
      );

      expect(
        config.isAllowedInWebView(Uri.parse('https://omlu.example/admin')),
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
      expect(
        config.isAllowedInWebView(Uri.parse('http://omlu.example')),
        false,
      );
    });

    test('detects external schemes and report downloads', () {
      final config = AppConfig.fromValues(
        configuredUrl: 'https://omlu.example',
        allowedDomains: '',
        allowHttp: false,
      );

      expect(config.isExternalScheme(Uri.parse('tel:+911234567890')), true);
      expect(
        config.isExternalScheme(Uri.parse('mailto:ops@omlu.example')),
        true,
      );
      expect(config.isExternalScheme(Uri.parse('geo:9.9,76.2')), true);
      expect(
        config.isDownload(Uri.parse('https://omlu.example/report.pdf')),
        true,
      );
      expect(
        config.isDownload(Uri.parse('https://omlu.example/report.csv')),
        true,
      );
    });
  });
}
