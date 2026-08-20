class AppConfig {
  AppConfig({
    required this.frontendUrl,
    required this.primaryBackendUrl,
    required this.fallbackBackendUrl,
    required this.allowedHosts,
    required this.allowHttp,
  });

  static const String fallbackFrontendUrl = 'https://omlu.in';
  static const String defaultPrimaryBackendUrl = 'https://api.omlu.in';
  static const String defaultFallbackBackendUrl = 'https://omlu-server.onrender.com';
  // Legacy fallback constant for backward compatibility
  static const String fallbackBackendUrlConstant = defaultPrimaryBackendUrl;

  final Uri frontendUrl;
  final Uri primaryBackendUrl;
  final Uri fallbackBackendUrl;
  final Set<String> allowedHosts;
  final bool allowHttp;

  /// Convenience getter for backward compatibility, returns primaryBackendUrl.
  Uri get backendUrl => primaryBackendUrl;

  static AppConfig fromEnvironment() {
    const configuredFrontend = String.fromEnvironment(
      'OMLU_FRONTEND_URL',
      defaultValue: fallbackFrontendUrl,
    );
    const configuredPrimaryBackend = String.fromEnvironment(
      'OMLU_PRIMARY_BACKEND_URL',
      defaultValue: '',
    );
    const configuredFallbackBackend = String.fromEnvironment(
      'OMLU_FALLBACK_BACKEND_URL',
      defaultValue: defaultFallbackBackendUrl,
    );
    const legacyBackend = String.fromEnvironment(
      'OMLU_BACKEND_URL',
      defaultValue: '',
    );
    const allowedDomains = String.fromEnvironment('OMLU_ALLOWED_DOMAINS');
    const allowHttpValue = bool.fromEnvironment(
      'OMLU_ALLOW_HTTP',
      defaultValue: false,
    );

    final primaryUrl = configuredPrimaryBackend.isNotEmpty
        ? configuredPrimaryBackend
        : (legacyBackend.isNotEmpty ? legacyBackend : defaultPrimaryBackendUrl);

    return AppConfig.fromValues(
      configuredFrontendUrl: configuredFrontend,
      configuredPrimaryBackendUrl: primaryUrl,
      configuredFallbackBackendUrl: configuredFallbackBackend,
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
    String configuredPrimaryBackendUrl = defaultPrimaryBackendUrl,
    String configuredFallbackBackendUrl = defaultFallbackBackendUrl,
    String? configuredBackendUrl,
    required String allowedDomains,
    required bool allowHttp,
  }) {
    final effectivePrimary = (configuredPrimaryBackendUrl.isNotEmpty &&
            configuredPrimaryBackendUrl != defaultPrimaryBackendUrl)
        ? configuredPrimaryBackendUrl
        : (configuredBackendUrl != null && configuredBackendUrl.isNotEmpty
            ? configuredBackendUrl
            : configuredPrimaryBackendUrl);

    final frontend = _parseAndNormalize(
      configuredFrontendUrl,
      allowHttp: allowHttp,
    );
    final primary = _parseAndNormalize(
      effectivePrimary,
      allowHttp: allowHttp,
    );
    final fallback = _parseAndNormalize(
      configuredFallbackBackendUrl,
      allowHttp: allowHttp,
    );

    final hosts = <String>{
      frontend.host.toLowerCase(),
      primary.host.toLowerCase(),
      fallback.host.toLowerCase(),
    };
    for (final host in allowedDomains.split(',')) {
      final normalized = host.trim().toLowerCase();
      if (normalized.isNotEmpty) hosts.add(normalized);
    }

    return AppConfig(
      frontendUrl: frontend,
      primaryBackendUrl: primary,
      fallbackBackendUrl: fallback,
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
