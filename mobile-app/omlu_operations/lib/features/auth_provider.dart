import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/api_client.dart';
import '../core/api/operations_api.dart';
import '../core/auth/auth_repository.dart';
import '../core/models/role_session.dart';
import '../core/storage/token_storage.dart';
import '../core/storage/secure_token_storage.dart';
import '../core/storage/operations_data_cache.dart';
import '../core/auth/native_auth_runtime.dart';
import '../src/app_config.dart';

final appConfigProvider = Provider<AppConfig>((ref) {
  return AppConfig.fromEnvironment();
});

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return SecureTokenStorage();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return ApiClient(
    baseUrl: config.backendUrl,
    authRuntime: ref.watch(nativeAuthRuntimeProvider),
  );
});

final operationsApiProvider = Provider<OperationsApi>((ref) {
  final client = ref.watch(apiClientProvider);
  return OperationsApi(client, cache: ref.watch(operationsDataCacheProvider));
});

final operationsDataCacheProvider = Provider<OperationsDataCache>((ref) {
  return OperationsDataCache(authRuntime: ref.watch(nativeAuthRuntimeProvider));
});

final nativeAuthRuntimeProvider = Provider<NativeAuthRuntime>((ref) {
  return NativeAuthRuntime();
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  final storage = ref.watch(tokenStorageProvider);
  return AuthRepository(
    apiClient: client,
    tokenStorage: storage,
    authRuntime: ref.watch(nativeAuthRuntimeProvider),
    operationsCache: ref.watch(operationsDataCacheProvider),
  );
});

class AuthStateNotifier extends StateNotifier<AsyncValue<RoleSession?>> {
  AuthStateNotifier(this._repository) : super(const AsyncValue.loading()) {
    _repository.onAuthenticationInvalid = (_) async {
      await _terminate('http_401', revokeServer: false);
    };
    restoreSession();
  }

  final AuthRepository _repository;

  Future<void> restoreSession() async {
    state = const AsyncValue.loading();
    try {
      final session = await _repository.restore();
      state = AsyncValue.data(session);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> login({
    required String restaurantSlug,
    required String login,
    required String password,
  }) async {
    final loginFuture = _repository.login(
      restaurantSlug: restaurantSlug,
      login: login,
      password: password,
    );
    state = const AsyncValue.loading();
    try {
      final session = await loginFuture;
      state = AsyncValue.data(session);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout() async {
    await _terminate('explicit_logout', revokeServer: true);
  }

  Future<void> _terminate(String reason, {required bool revokeServer}) async {
    final teardown = _repository.terminate(
      reason: reason,
      revokeServer: revokeServer,
    );
    state = const AsyncValue.loading();
    try {
      await teardown;
    } finally {
      state = const AsyncData<RoleSession?>(null);
    }
  }
}

final authProvider =
    StateNotifierProvider<AuthStateNotifier, AsyncValue<RoleSession?>>((ref) {
      final repository = ref.watch(authRepositoryProvider);
      return AuthStateNotifier(repository);
    });
