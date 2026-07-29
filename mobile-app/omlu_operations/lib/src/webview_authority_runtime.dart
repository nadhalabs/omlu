import 'dart:async';

import '../core/auth/flutter_tenant_scope.dart';
import 'navigation_policy.dart';

enum WebViewAuthorityPhase {
  unknown,
  validating,
  authenticated,
  terminating,
  anonymous,
}

class WebViewAuthoritySnapshot {
  const WebViewAuthoritySnapshot({
    required this.phase,
    required this.generation,
    this.scope,
    this.workspace,
  });

  final WebViewAuthorityPhase phase;
  final int generation;
  final FlutterTenantScope? scope;
  final Uri? workspace;
}

typedef WebViewIdentityCleanup = FutureOr<void> Function();

/// Authority state for the embedded browser. A loaded route is never authority.
class WebViewAuthorityRuntime {
  WebViewAuthorityRuntime({
    required NavigationPolicy navigationPolicy,
    required WebViewIdentityCleanup clearIdentityData,
  }) : _navigationPolicy = navigationPolicy,
       _clearIdentityData = clearIdentityData;

  final NavigationPolicy _navigationPolicy;
  final WebViewIdentityCleanup _clearIdentityData;

  WebViewAuthorityPhase _phase = WebViewAuthorityPhase.unknown;
  FlutterTenantScope? _scope;
  Uri? _workspace;
  int _generation = 0;
  Future<void>? _teardown;

  WebViewAuthoritySnapshot get snapshot => WebViewAuthoritySnapshot(
    phase: _phase,
    generation: _generation,
    scope: _scope,
    workspace: _workspace,
  );

  bool get isAuthenticated =>
      _phase == WebViewAuthorityPhase.authenticated && _scope != null;

  void beginValidation() {
    if (_phase == WebViewAuthorityPhase.terminating) return;
    _phase = WebViewAuthorityPhase.validating;
  }

  void activate(FlutterTenantScope scope) {
    if (_phase == WebViewAuthorityPhase.terminating) {
      throw StateError('WebView authentication teardown is in progress.');
    }
    if (_scope != null && _scope != scope) {
      throw StateError('Previous WebView authority must be torn down first.');
    }
    if (_scope == null) _generation += 1;
    _scope = scope;
    _phase = WebViewAuthorityPhase.authenticated;
  }

  bool mayNavigate(Uri uri) {
    if (_navigationPolicy.isForcedPasswordChangeRoute(uri)) return true;
    if (_navigationPolicy.isAnonymousAuthRoute(uri)) return true;
    if (_navigationPolicy.isAuthenticatedWorkspace(uri)) {
      return isAuthenticated;
    }
    return true;
  }

  void rememberPage(Uri uri) {
    if (!isAuthenticated) return;
    if (_navigationPolicy.isAuthenticatedWorkspace(uri)) {
      _workspace = uri;
    }
  }

  Future<void> terminate({required String reason}) {
    final existing = _teardown;
    if (existing != null) return existing;
    _phase = WebViewAuthorityPhase.terminating;
    _generation += 1;
    _scope = null;
    _workspace = null;
    final completer = Completer<void>();
    _teardown = completer.future;
    () async {
      try {
        await _clearIdentityData();
      } finally {
        _phase = WebViewAuthorityPhase.anonymous;
        _teardown = null;
        completer.complete();
      }
    }();
    return completer.future;
  }
}
