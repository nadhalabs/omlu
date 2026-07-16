class AppConfig {
  AppConfig({
    required this.frontendUrl,
    required this.backendUrl,
    required this.allowedHosts,
    required this.allowHttp,
  });

  static const String fallbackFrontendUrl = 'https://omlu.vercel.app';
  static const String fallbackBackendUrl = 'https://omlu-api.onrender.com';

  final Uri frontendUrl;
  final Uri backendUrl;
  final Set<String> allowedHosts;
  final bool allowHttp;

  static AppConfig fromEnvironment() {
    const configuredFrontend = String.fromEnvironment(
      'OMLU_FRONTEND_URL',
      defaultValue: fallbackFrontendUrl,
    );
    const configuredBackend = String.fromEnvironment(
      'OMLU_BACKEND_URL',
      defaultValue: fallbackBackendUrl,
    );
    const allowedDomains = String.fromEnvironment('OMLU_ALLOWED_DOMAINS');
    const allowHttpValue = bool.fromEnvironment(
      'OMLU_ALLOW_HTTP',
      defaultValue: false,
    );

    return AppConfig.fromValues(
      configuredFrontendUrl: configuredFrontend,
      configuredBackendUrl: configuredBackend,
      allowedDomains: allowedDomains,
      allowHttp: allowHttpValue,
    );
  }

  static Uri _parseAndNormalize(String url, {required bool allowHttp}) {
    var trimmed = url.trim();
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    final parsed = Uri.parse(trimmed);
    if (!parsed.hasScheme || parsed.host.isEmpty) {
      throw ArgumentError('OMLU URL must be an absolute URL: $url');
    }
    if (parsed.scheme != 'https' && !(allowHttp && parsed.scheme == 'http')) {
      throw ArgumentError(
        'OMLU URL must use HTTPS unless OMLU_ALLOW_HTTP=true is set for development: $url',
      );
    }
    return parsed;
  }

  static AppConfig fromValues({
    required String configuredFrontendUrl,
    required String configuredBackendUrl,
    required String allowedDomains,
    required bool allowHttp,
  }) {
    final frontend = _parseAndNormalize(
      configuredFrontendUrl,
      allowHttp: allowHttp,
    );
    final backend = _parseAndNormalize(
      configuredBackendUrl,
      allowHttp: allowHttp,
    );

    final hosts = <String>{
      frontend.host.toLowerCase(),
      backend.host.toLowerCase(),
    };
    for (final host in allowedDomains.split(',')) {
      final normalized = host.trim().toLowerCase();
      if (normalized.isNotEmpty) hosts.add(normalized);
    }

    return AppConfig(
      frontendUrl: frontend,
      backendUrl: backend,
      allowedHosts: hosts,
      allowHttp: allowHttp,
    );
  }

  bool isAllowedInWebView(Uri uri) {
    if (uri.scheme != 'https' && !(allowHttp && uri.scheme == 'http')) {
      return false;
    }
    return allowedHosts.contains(uri.host.toLowerCase());
  }

  bool isExternalScheme(Uri uri) {
    return switch (uri.scheme.toLowerCase()) {
      'tel' || 'mailto' || 'sms' || 'geo' || 'maps' || 'intent' => true,
      _ => false,
    };
  }

  bool isDownload(Uri uri) {
    final path = uri.path.toLowerCase();
    return path.endsWith('.pdf') || path.endsWith('.csv');
  }
}
