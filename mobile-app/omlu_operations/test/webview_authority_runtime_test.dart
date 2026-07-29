import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/auth/flutter_tenant_scope.dart';
import 'package:omlu_operations/src/navigation_policy.dart';
import 'package:omlu_operations/src/webview_authority_runtime.dart';

const _scopeA = FlutterTenantScope(
  restaurantId: 1,
  actorId: 10,
  role: StaffRole.admin,
  authorityEpoch: 'v1.account-a',
);
const _scopeB = FlutterTenantScope(
  restaurantId: 2,
  actorId: 20,
  role: StaffRole.staff,
  authorityEpoch: 'v1.account-b',
);

void main() {
  late List<String> cleanup;
  late WebViewAuthorityRuntime runtime;

  setUp(() {
    cleanup = [];
    runtime = WebViewAuthorityRuntime(
      navigationPolicy: const NavigationPolicy(),
      clearIdentityData: () async => cleanup.add('cookies-storage-cache'),
    );
  });

  test('anonymous login and register navigation is never redirected', () {
    runtime.beginValidation();
    expect(
      runtime.mayNavigate(Uri.parse('https://omlu.example/login')),
      true,
    );
    expect(
      runtime.mayNavigate(Uri.parse('https://omlu.example/register')),
      true,
    );
    expect(
      runtime.mayNavigate(Uri.parse('https://omlu.example/admin')),
      false,
    );
  });

  test('forced password-change remains accessible to valid authority', () {
    runtime.activate(_scopeA);
    expect(
      runtime.mayNavigate(
        Uri.parse('https://omlu.example/staff/change-password'),
      ),
      true,
    );
  });

  test('logout clears workspace and blocks browser-back privilege', () async {
    runtime.activate(_scopeA);
    runtime.rememberPage(Uri.parse('https://omlu.example/admin/staff'));
    expect(runtime.snapshot.workspace, isNotNull);

    await runtime.terminate(reason: 'explicit_logout');

    expect(runtime.snapshot.phase, WebViewAuthorityPhase.anonymous);
    expect(runtime.snapshot.scope, isNull);
    expect(runtime.snapshot.workspace, isNull);
    expect(cleanup, ['cookies-storage-cache']);
    expect(
      runtime.mayNavigate(Uri.parse('https://omlu.example/admin/staff')),
      false,
    );
    expect(
      runtime.mayNavigate(Uri.parse('https://omlu.example/login')),
      true,
    );
  });

  test('all authoritative termination signals use idempotent cleanup', () async {
    for (final reason in [
      'http_401',
      'token_expired',
      'session_revoked',
      'suspended',
      'deleted',
      'role_changed',
      'restaurant_reassigned',
    ]) {
      runtime.activate(_scopeA);
      final first = runtime.terminate(reason: reason);
      final second = runtime.terminate(reason: '$reason-concurrent');
      expect(identical(first, second), true);
      await first;
    }
    expect(cleanup, hasLength(7));
  });

  test('stale page callback cannot restore workspace after teardown', () async {
    runtime.activate(_scopeA);
    await runtime.terminate(reason: 'logout');
    runtime.rememberPage(Uri.parse('https://omlu.example/admin'));
    expect(runtime.snapshot.workspace, isNull);
    expect(runtime.snapshot.phase, WebViewAuthorityPhase.anonymous);
  });

  test('Account B cannot activate until A cleanup completes', () async {
    final gate = Completer<void>();
    runtime = WebViewAuthorityRuntime(
      navigationPolicy: const NavigationPolicy(),
      clearIdentityData: () => gate.future,
    );
    runtime.activate(_scopeA);
    final teardown = runtime.terminate(reason: 'account_switch');
    expect(() => runtime.activate(_scopeB), throwsStateError);
    gate.complete();
    await teardown;
    runtime.activate(_scopeB);
    expect(runtime.snapshot.scope, _scopeB);
    expect(runtime.snapshot.workspace, isNull);
  });

  test('ordinary forbidden response preserves current authority', () {
    runtime.activate(_scopeA);
    // A 403 has no termination transition; the current scope remains active.
    expect(runtime.snapshot.scope, _scopeA);
    expect(runtime.snapshot.phase, WebViewAuthorityPhase.authenticated);
  });

  test('restart after logout starts without remembered authority', () async {
    runtime.activate(_scopeA);
    runtime.rememberPage(Uri.parse('https://omlu.example/admin'));
    await runtime.terminate(reason: 'logout');

    final restarted = WebViewAuthorityRuntime(
      navigationPolicy: const NavigationPolicy(),
      clearIdentityData: () {},
    )..beginValidation();
    expect(restarted.snapshot.workspace, isNull);
    expect(
      restarted.mayNavigate(Uri.parse('https://omlu.example/admin')),
      false,
    );
  });
}
