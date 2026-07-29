import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/auth/flutter_tenant_scope.dart';
import 'package:omlu_operations/core/auth/native_auth_runtime.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';
import 'package:omlu_operations/core/storage/operations_data_cache.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';

const testTenantScope = FlutterTenantScope(
  restaurantId: 1,
  actorId: 10,
  role: StaffRole.staff,
  authorityEpoch: 'v1.test-opaque-epoch',
);

FlutterTenantScope testScopeFor(StaffRole role) => FlutterTenantScope(
  restaurantId: 1,
  actorId: 10,
  role: role,
  authorityEpoch: 'v1.test-opaque-epoch',
);

({NativeAuthRuntime runtime, OperationsDataCache cache})
testAuthenticatedCache({
  FlutterTenantScope scope = testTenantScope,
  MemoryKeyValueStorage? storage,
}) {
  final runtime = NativeAuthRuntime()..activate(scope);
  return (
    runtime: runtime,
    cache: OperationsDataCache(
      authRuntime: runtime,
      storage: storage ?? MemoryKeyValueStorage(),
    ),
  );
}

AuthRepository testAuthRepository(ApiClient client, TokenStorage storage) {
  final dependencies = testAuthenticatedCache();
  return AuthRepository(
    apiClient: client,
    tokenStorage: storage,
    authRuntime: dependencies.runtime,
    operationsCache: dependencies.cache,
  );
}
