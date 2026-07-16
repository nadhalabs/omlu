import '../api/api_client.dart';
import '../api/api_exceptions.dart';
import '../models/role_session.dart';
import '../storage/token_storage.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
    DateTime Function()? now,
  }) : _apiClient = apiClient,
       _tokenStorage = tokenStorage,
       _now = now ?? DateTime.now;

  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;
  final DateTime Function() _now;

  Future<RoleSession> login({
    required String restaurantSlug,
    required String login,
    required String password,
  }) async {
    final json = await _apiClient.postJson(
      '/auth/staff/login',
      body: {
        'restaurant_slug': restaurantSlug,
        'login': login,
        'password': password,
      },
    );
    final session = _sessionFromLoginJson(json);
    _apiClient.accessToken = session.accessToken;
    await _tokenStorage.save(session);
    return session;
  }

  Future<RoleSession?> restore() async {
    final session = await _tokenStorage.read();
    if (session == null || session.isExpired) {
      await logoutLocal();
      return null;
    }
    _apiClient.accessToken = session.accessToken;
    try {
      final profile = await currentUser();
      final refreshed = RoleSession(
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        profile: profile,
      );
      await _tokenStorage.save(refreshed);
      return refreshed;
    } on AuthenticationException {
      await logoutLocal();
      return null;
    }
  }

  Future<StaffProfile> currentUser() async {
    final json = await _apiClient.getJson('/auth/staff/me');
    return StaffProfile.fromJson(json);
  }

  Future<void> logout() async {
    try {
      await _apiClient.postJson('/auth/staff/logout');
    } on AuthenticationException {
      // A revoked/expired token is already logged out from the app perspective.
    } finally {
      await logoutLocal();
    }
  }

  Future<void> logoutLocal() async {
    _apiClient.accessToken = null;
    await _tokenStorage.clear();
  }

  RoleSession _sessionFromLoginJson(Map<String, Object?> json) {
    final token = json['access_token'] as String?;
    final expiresIn = json['expires_in'] as int?;
    final staffJson = json['staff'];
    if (token == null || expiresIn == null || staffJson is! Map) {
      throw const ApiException('Malformed login response.');
    }
    return RoleSession(
      accessToken: token,
      expiresAt: _now().toUtc().add(Duration(seconds: expiresIn)),
      profile: StaffProfile.fromJson(Map<String, Object?>.from(staffJson)),
    );
  }
}
