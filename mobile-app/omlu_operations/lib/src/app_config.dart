class AppConfig {
  AppConfig({
    required this.initialUrl,
    required this.allowedHosts,
    required this.allowHttp,
  });

  static const String fallbackUrl = 'https://omlu.vercel.app';

  final Uri initialUrl;
  final Set<String> allowedHosts;
  final bool allowHttp;

  static AppConfig fromEnvironment() {
    const configuredUrl = String.fromEnvironment(
      'OMLU_APP_URL',
      defaultValue: fallbackUrl,
    );
    const allowedDomains = String.fromEnvironment('OMLU_ALLOWED_DOMAINS');
    const allowHttpValue = bool.fromEnvironment(
      'OMLU_ALLOW_HTTP',
      defaultValue: false,
    );

    return AppConfig.fromValues(
      configuredUrl: configuredUrl,
      allowedDomains: allowedDomains,
      allowHttp: allowHttpValue,
    );
  }

  static AppConfig fromValues({
    required String configuredUrl,
    required String allowedDomains,
    required bool allowHttp,
  }) {
    final parsed = Uri.parse(configuredUrl.trim());
    if (!parsed.hasScheme || parsed.host.isEmpty) {
      throw ArgumentError('OMLU_APP_URL must be an absolute URL.');
    }
    if (parsed.scheme != 'https' && !(allowHttp && parsed.scheme == 'http')) {
      throw ArgumentError(
        'OMLU_APP_URL must use HTTPS unless OMLU_ALLOW_HTTP=true is set for development.',
      );
    }

    final hosts = <String>{parsed.host.toLowerCase()};
    for (final host in allowedDomains.split(',')) {
      final normalized = host.trim().toLowerCase();
      if (normalized.isNotEmpty) hosts.add(normalized);
    }

    return AppConfig(
      initialUrl: parsed,
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
