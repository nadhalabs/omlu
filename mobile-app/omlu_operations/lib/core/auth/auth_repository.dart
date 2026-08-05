import '../api/api_client.dart';
import '../api/api_exceptions.dart';
import '../models/role_session.dart';
import '../storage/operations_data_cache.dart';
import '../storage/token_storage.dart';
import 'flutter_tenant_scope.dart';
import 'native_auth_runtime.dart';

import '../storage/secure_token_storage.dart';

class AuthenticatedProfile {
  const AuthenticatedProfile(this.profile, this.scope);
  final StaffProfile profile;
  final FlutterTenantScope scope;
}

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
    required NativeAuthRuntime authRuntime,
    required OperationsDataCache operationsCache,
    DateTime Function()? now,
  }) : _apiClient = apiClient,
       _tokenStorage = tokenStorage,
       _authRuntime = authRuntime,
       _operationsCache = operationsCache,
       _now = now ?? DateTime.now {
    _authRuntime.registerCleanup(
      (_) => _operationsCache.clearAuthenticatedData(),
    );
  }

  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;
  final NativeAuthRuntime _authRuntime;
  final OperationsDataCache _operationsCache;
  final DateTime Function() _now;
  Future<void>? _teardown;

  Future<RoleSession> login({
    required String restaurantSlug,
    required String login,
    required String password,
    EntryMode entryMode = EntryMode.ownerAdmin,
  }) async {
    await terminate(reason: 'account_switch', revokeServer: true);
    final json = await _apiClient.postJson(
      '/auth/staff/login',
      body: {
        'restaurant_slug': restaurantSlug,
        'login': login,
        'password': password,
      },
    );
    final token = json['access_token'] as String?;
    final expiresIn = json['expires_in'] as int?;
    if (token == null || expiresIn == null) {
      throw const ApiException('Malformed login response.');
    }
    _apiClient.accessToken = token;
    try {
      final authenticated = await currentUser();
      final role = authenticated.profile.role;

      final isAllowed = switch (entryMode) {
        EntryMode.ownerAdmin =>
          role == StaffRole.owner || role == StaffRole.admin,
        EntryMode.staffPin => role == StaffRole.staff,
        EntryMode.kitchenDevice => role == StaffRole.kitchen,
      };

      if (!isAllowed) {
        await terminate(reason: 'role_mismatch_login', revokeServer: true);
        final message = switch (entryMode) {
          EntryMode.ownerAdmin => role == StaffRole.kitchen
              ? 'Use Kitchen Device to sign in with this account.'
              : 'This account cannot use the owner/admin workspace.',
          EntryMode.staffPin => role == StaffRole.owner || role == StaffRole.admin
              ? 'This account belongs to an owner or admin. Use Owner / Admin Sign In.'
              : 'Use Kitchen Device to sign in with this account.',
          EntryMode.kitchenDevice => role == StaffRole.owner || role == StaffRole.admin
              ? 'This account belongs to an owner or admin. Use Owner / Admin Sign In.'
              : 'This account cannot use the owner/admin workspace.',
        };
        throw AuthenticationException(message);
      }

      if (authenticated.profile.mustChangePassword) {
        throw const AuthenticationException(
          'This account requires a password reset by the restaurant owner.',
        );
      }

      final session = RoleSession(
        accessToken: token,
        expiresAt: _now().toUtc().add(Duration(seconds: expiresIn)),
        profile: authenticated.profile,
        tenantScope: authenticated.scope,
        entryMode: entryMode,
      );
      _authRuntime.activate(authenticated.scope);
      await _operationsCache.initializeScope();
      await _tokenStorage.save(session);
      return session;
    } catch (_) {
      await terminate(reason: 'login_me_failed', revokeServer: true);
      rethrow;
    }
  }

  Future<RoleSession?> restore() async {
    RoleSession? stored;
    try {
      stored = await _tokenStorage.read();
    } on StoredSessionRecoveryException {
      await terminate(reason: 'storage_recovery', revokeServer: false);
      return null;
    }
    if (stored == null || stored.isExpired) {
      await terminate(reason: 'invalid_session_restore', revokeServer: false);
      return null;
    }
    _apiClient.accessToken = stored.accessToken;
    try {
      final authenticated = await currentUser();
      final refreshed = RoleSession(
        accessToken: stored.accessToken,
        expiresAt: stored.expiresAt,
        profile: authenticated.profile,
        tenantScope: authenticated.scope,
        entryMode: stored.entryMode,
      );

      if (!refreshed.isEntryModeValid) {
        await terminate(reason: 'restore_role_mismatch', revokeServer: false);
        return null;
      }

      _authRuntime.activate(authenticated.scope);
      await _operationsCache.initializeScope();
      await _tokenStorage.save(refreshed);
      return refreshed;
    } on AuthenticationException {
      await terminate(reason: 'restore_unauthorized', revokeServer: false);
      return null;
    } catch (_) {
      await terminate(reason: 'restore_me_failed', revokeServer: false);
      rethrow;
    }
  }

  Future<AuthenticatedProfile> currentUser() async {
    final json = await _apiClient.getJson('/auth/staff/me');
    final scopeJson = json['scope'];
    if (scopeJson is! Map) {
      throw const ApiException(
        'Authenticated profile is missing tenant scope.',
      );
    }
    return AuthenticatedProfile(
      StaffProfile.fromJson(json),
      FlutterTenantScope.fromJson(Map<String, Object?>.from(scopeJson)),
    );
  }

  Future<void> logout() =>
      terminate(reason: 'explicit_logout', revokeServer: true);

  set onAuthenticationInvalid(
    Future<void> Function(NativeAuthorityLease lease)? handler,
  ) {
    _apiClient.onAuthenticationInvalid = handler;
  }

  Future<void> terminate({required String reason, required bool revokeServer}) {
    final existing = _teardown;
    if (existing != null) return existing;
    final future = _performTeardown(reason, revokeServer);
    _teardown = future;
    return future.whenComplete(() => _teardown = null);
  }

  Future<void> _performTeardown(String reason, bool revokeServer) async {
    await _authRuntime.terminate(reason: reason);
    if (revokeServer) {
      try {
        await _apiClient.postJson('/auth/staff/logout');
      } on ApiException {
        // Local authority still terminates when server revocation is unavailable.
      }
    }
    _apiClient.accessToken = null;
    await _tokenStorage.clear();
  }

  Future<void> logoutLocal() =>
      terminate(reason: 'local_logout', revokeServer: false);
}
