import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/api_client.dart';
import '../core/api/operations_api.dart';
import '../core/auth/auth_repository.dart';
import '../core/models/role_session.dart';
import '../core/storage/token_storage.dart';
import '../core/storage/secure_token_storage.dart';
import '../src/app_config.dart';

final appConfigProvider = Provider<AppConfig>((ref) {
  return AppConfig.fromEnvironment();
});

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return SecureTokenStorage();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return ApiClient(baseUrl: config.initialUrl);
});

final operationsApiProvider = Provider<OperationsApi>((ref) {
  final client = ref.watch(apiClientProvider);
  return OperationsApi(client);
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  final storage = ref.watch(tokenStorageProvider);
  return AuthRepository(apiClient: client, tokenStorage: storage);
});

class AuthStateNotifier extends StateNotifier<AsyncValue<RoleSession?>> {
  AuthStateNotifier(this._repository) : super(const AsyncValue.loading()) {
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
    state = const AsyncValue.loading();
    try {
      final session = await _repository.login(
        restaurantSlug: restaurantSlug,
        login: login,
        password: password,
      );
      state = AsyncValue.data(session);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout() async {
    state = const AsyncValue.loading();
    try {
      await _repository.logout();
      state = const AsyncData<RoleSession?>(null);
    } catch (e) {
      await _repository.logoutLocal();
      state = const AsyncData<RoleSession?>(null);
    }
  }
}

final authProvider =
    StateNotifierProvider<AuthStateNotifier, AsyncValue<RoleSession?>>((ref) {
      final repository = ref.watch(authRepositoryProvider);
      return AuthStateNotifier(repository);
    });
