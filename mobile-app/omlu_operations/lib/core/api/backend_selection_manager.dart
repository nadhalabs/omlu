import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../../src/app_config.dart';
import 'api_client.dart';

enum BackendTarget { primary, fallback }

class BackendSelectionManager extends ChangeNotifier {
  BackendSelectionManager({
    required AppConfig config,
    BackendTarget initialTarget = BackendTarget.primary,
    ApiTransport? probeTransport,
  })  : _config = config,
        _activeTarget = initialTarget,
        _probeTransport = probeTransport {
    _startRecoveryTimerIfNeeded();
  }

  final AppConfig _config;
  BackendTarget _activeTarget;
  final ApiTransport? _probeTransport;
  Timer? _recoveryTimer;
  bool _isProbing = false;

  AppConfig get config => _config;
  BackendTarget get activeTarget => _activeTarget;
  bool get isPrimary => _activeTarget == BackendTarget.primary;
  bool get isFallback => _activeTarget == BackendTarget.fallback;

  Uri get primaryBackendUrl => _config.primaryBackendUrl;
  Uri get fallbackBackendUrl => _config.fallbackBackendUrl;

  Uri get activeBackendUrl =>
      isPrimary ? _config.primaryBackendUrl : _config.fallbackBackendUrl;

  Uri get activeWsUri {
    final baseUrl = activeBackendUrl;
    final scheme = baseUrl.scheme == 'https' ? 'wss' : 'ws';
    return baseUrl.replace(scheme: scheme);
  }

  bool activateFallback({Object? error, String? reason}) {
    if (_activeTarget == BackendTarget.fallback) return false;
    _activeTarget = BackendTarget.fallback;
    _startRecoveryTimerIfNeeded();
    notifyListeners();
    return true;
  }

  bool activatePrimary({String? reason}) {
    if (_activeTarget == BackendTarget.primary) return false;
    _activeTarget = BackendTarget.primary;
    _stopRecoveryTimer();
    notifyListeners();
    return true;
  }

  void _startRecoveryTimerIfNeeded() {
    if (_activeTarget == BackendTarget.fallback && _recoveryTimer == null) {
      _recoveryTimer = Timer.periodic(const Duration(seconds: 60), (_) {
        probeAndMigrateBackToPrimary();
      });
    }
  }

  void _stopRecoveryTimer() {
    _recoveryTimer?.cancel();
    _recoveryTimer = null;
  }

  /// Probes primary server endpoint (/ready). If reachable, migrates active target back to primary.
  /// Does not interrupt in-flight write operations.
  Future<bool> probeAndMigrateBackToPrimary() async {
    if (isPrimary) return true;
    if (_isProbing) return false;
    _isProbing = true;

    try {
      final probeUri = primaryBackendUrl.replace(
        path: _joinPath(primaryBackendUrl.path, '/ready'),
      );

      final transport = _probeTransport ?? _defaultProbeTransport;
      final response = await transport(
        ApiRequest(
          method: 'GET',
          uri: probeUri,
          headers: const {'Accept': 'application/json'},
        ),
      ).timeout(const Duration(seconds: 5));

      // Any HTTP status code response indicates the primary server is reachable over the network.
      if (response.statusCode > 0) {
        activatePrimary(reason: 'Primary backend recovered');
        return true;
      }
    } catch (_) {
      // Primary server is still unreachable
    } finally {
      _isProbing = false;
    }
    return false;
  }

  @override
  void dispose() {
    _stopRecoveryTimer();
    super.dispose();
  }

  static String _joinPath(String basePath, String path) {
    final cleanBase = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return '$cleanBase$cleanPath';
  }

  static Future<ApiResponse> _defaultProbeTransport(ApiRequest request) async {
    final client = HttpClient();
    try {
      final httpRequest = await client.openUrl(request.method, request.uri);
      request.headers.forEach(httpRequest.headers.set);
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
