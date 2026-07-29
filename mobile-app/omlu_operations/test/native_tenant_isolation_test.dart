import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/auth/flutter_tenant_scope.dart';
import 'package:omlu_operations/core/auth/native_auth_runtime.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';
import 'package:omlu_operations/core/storage/operations_data_cache.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/features/staff/cart_provider.dart';

const scopeA = FlutterTenantScope(
  restaurantId: 1,
  actorId: 10,
  role: StaffRole.staff,
  authorityEpoch: 'v1.opaque-a',
);
const scopeB = FlutterTenantScope(
  restaurantId: 2,
  actorId: 20,
  role: StaffRole.staff,
  authorityEpoch: 'v1.opaque-b',
);

void main() {
  group('canonical Flutter tenant scope', () {
    test('equality and serialization include every authority dimension', () {
      expect(FlutterTenantScope.fromJson(scopeA.toJson()), scopeA);
      expect(scopeA, isNot(scopeB));
      expect(
        scopeA,
        isNot(
          const FlutterTenantScope(
            restaurantId: 2,
            actorId: 10,
            role: StaffRole.staff,
            authorityEpoch: 'v1.opaque-a',
          ),
        ),
      );
      expect(
        scopeA,
        isNot(
          const FlutterTenantScope(
            restaurantId: 1,
            actorId: 11,
            role: StaffRole.staff,
            authorityEpoch: 'v1.opaque-a',
          ),
        ),
      );
      expect(
        scopeA,
        isNot(
          const FlutterTenantScope(
            restaurantId: 1,
            actorId: 10,
            role: StaffRole.owner,
            authorityEpoch: 'v1.opaque-a',
          ),
        ),
      );
      expect(
        scopeA,
        isNot(
          const FlutterTenantScope(
            restaurantId: 1,
            actorId: 10,
            role: StaffRole.staff,
            authorityEpoch: 'v1.changed',
          ),
        ),
      );
    });

    test(
      'scoped keys are deterministic and contain no access token or JTI',
      () {
        const builder = ScopedStorageKeyBuilder();
        final first = builder.build(
          scopeA,
          feature: 'tables',
          identifier: 'all',
        );
        expect(
          first,
          builder.build(scopeA, feature: 'tables', identifier: 'all'),
        );
        expect(first, isNot(builder.build(scopeB, feature: 'tables')));
        expect(
          first,
          isNot(
            builder.build(
              const FlutterTenantScope(
                restaurantId: 1,
                actorId: 99,
                role: StaffRole.staff,
                authorityEpoch: 'v1.opaque-a',
              ),
              feature: 'tables',
            ),
          ),
        );
        expect(first, contains('role:staff'));
        expect(
          first,
          isNot(
            builder.build(
              const FlutterTenantScope(
                restaurantId: 1,
                actorId: 10,
                role: StaffRole.owner,
                authorityEpoch: 'v1.opaque-a',
              ),
              feature: 'tables',
            ),
          ),
        );
        expect(
          first,
          isNot(
            builder.build(
              const FlutterTenantScope(
                restaurantId: 1,
                actorId: 10,
                role: StaffRole.staff,
                authorityEpoch: 'v1.opaque-new',
              ),
              feature: 'tables',
            ),
          ),
        );
        expect(first, isNot(contains('access-token')));
        expect(first, isNot(contains('raw-jti')));
      },
    );
  });

  test(
    'persistent A data and same table ID are unreachable after B login',
    () async {
      final storage = MemoryKeyValueStorage();
      final runtimeA = NativeAuthRuntime()..activate(scopeA);
      final cacheA = OperationsDataCache(
        authRuntime: runtimeA,
        storage: storage,
      );
      await cacheA.write('tables', ['A table'], identifier: 'all');
      await cacheA.write('staff-cart-draft', {
        'restaurant_id': 1,
        'table_id': 1,
        'items': ['A item'],
      }, identifier: 'active');

      // Simulate process death: memory is gone, persistent storage remains.
      final runtimeB = NativeAuthRuntime()..activate(scopeB);
      final cacheB = OperationsDataCache(
        authRuntime: runtimeB,
        storage: storage,
      );
      expect(
        await cacheB.read(
          'tables',
          identifier: 'all',
          maxAge: const Duration(days: 1),
        ),
        isNull,
      );
      expect(
        await cacheB.read(
          'staff-cart-draft',
          identifier: 'active',
          maxAge: const Duration(days: 1),
        ),
        isNull,
      );
    },
  );

  test('changed authority epoch cannot restore the previous draft', () async {
    final storage = MemoryKeyValueStorage();
    final runtime = NativeAuthRuntime()..activate(scopeA);
    final cache = OperationsDataCache(authRuntime: runtime, storage: storage);
    await cache.write('staff-cart-draft', {'table_id': 5});
    await runtime.terminate(reason: 'restart');
    runtime.activate(
      const FlutterTenantScope(
        restaurantId: 1,
        actorId: 10,
        role: StaffRole.staff,
        authorityEpoch: 'v1.new-epoch',
      ),
    );
    expect(
      await cache.read('staff-cart-draft', maxAge: const Duration(days: 1)),
      isNull,
    );
  });

  test(
    'active cart uses authoritative restaurant and clears on logout',
    () async {
      final storage = MemoryKeyValueStorage();
      final runtime = NativeAuthRuntime()..activate(scopeA);
      final cache = OperationsDataCache(authRuntime: runtime, storage: storage);
      runtime.registerCleanup((_) => cache.clearAuthenticatedData());
      final container = ProviderContainer(
        overrides: [
          cartProvider.overrideWith(
            (ref) => CartNotifier(
              ref,
              scope: scopeA,
              restaurantSlug: 'restaurant-a',
              cache: cache,
              authRuntime: runtime,
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      final cart = container.read(cartProvider.notifier);
      cart.setTable(1);
      cart.addItem(99, note: 'A draft');
      await Future<void>.delayed(Duration.zero);
      expect(container.read(cartProvider).restaurantId, 1);
      expect(container.read(cartProvider).restaurantSlug, 'restaurant-a');
      expect(container.read(cartProvider).tableId, 1);
      expect(container.read(cartProvider).items, isNotEmpty);

      await runtime.terminate(reason: 'logout');
      expect(container.read(cartProvider).items, isEmpty);
      expect(container.read(cartProvider).tableId, isNull);
      expect(
        storage.values.keys.where((key) => key.startsWith('omlu:v2:')),
        isEmpty,
      );
    },
  );

  test(
    'legacy operational keys are deleted while preferences remain',
    () async {
      final storage = MemoryKeyValueStorage({
        'omlu_reference_cache_v1_tables_all': 'unsafe',
        'omlu_reference_cache_v1_menu_demo_1': 'unsafe',
        'staff_access_v1_demo_staff': 'unsafe',
        'staff_cart': 'unsafe',
        'selected_table': 'unsafe',
        'theme': 'dark',
        'language': 'ml',
      });
      final runtime = NativeAuthRuntime()..activate(scopeA);
      final cache = OperationsDataCache(authRuntime: runtime, storage: storage);
      await cache.initializeScope();
      expect(
        storage.values,
        isNot(contains('omlu_reference_cache_v1_tables_all')),
      );
      expect(
        storage.values,
        isNot(contains('omlu_reference_cache_v1_menu_demo_1')),
      );
      expect(storage.values, isNot(contains('staff_access_v1_demo_staff')));
      expect(storage.values, isNot(contains('staff_cart')));
      expect(storage.values, isNot(contains('selected_table')));
      expect(storage.values['theme'], 'dark');
      expect(storage.values['language'], 'ml');
    },
  );

  test(
    'teardown is idempotent, ordered, and blocks B until complete',
    () async {
      final runtime = NativeAuthRuntime()..activate(scopeA);
      final gate = Completer<void>();
      final order = <String>[];
      runtime.registerCleanup((_) async {
        order.add('realtime-stop');
        await gate.future;
        order.add('providers-cleared');
      });
      final first = runtime.terminate(reason: 'logout');
      final second = runtime.terminate(reason: '401');
      expect(identical(first, second), isTrue);
      expect(() => runtime.activate(scopeB), throwsStateError);
      gate.complete();
      await first;
      runtime.activate(scopeB);
      expect(order, ['realtime-stop', 'providers-cleared']);
      expect(runtime.scope, scopeB);
    },
  );

  test('late A response is rejected after B establishes authority', () async {
    final runtime = NativeAuthRuntime()..activate(scopeA);
    final oldLease = runtime.capture();
    await runtime.terminate(reason: 'switch');
    runtime.activate(scopeB);
    expect(
      () => runtime.ensureCurrent(oldLease),
      throwsA(isA<StaleNativeAuthorityException>()),
    );
  });

  test(
    'active 401 tears down, 403 preserves, stale A 401 cannot end B',
    () async {
      final responseA = Completer<ApiResponse>();
      final runtime = NativeAuthRuntime()..activate(scopeA);
      var invalidations = 0;
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'opaque-token',
        authRuntime: runtime,
        transport: (_) => responseA.future,
      );
      client.onAuthenticationInvalid = (_) async {
        invalidations += 1;
        await runtime.terminate(reason: '401');
      };
      final oldRequest = client.getJson('/staff/tables');
      await runtime.terminate(reason: 'account-switch');
      runtime.activate(scopeB);
      responseA.complete(
        const ApiResponse(statusCode: 401, body: {'detail': 'revoked'}),
      );
      await expectLater(oldRequest, throwsA(isA<AuthenticationException>()));
      expect(invalidations, 0);
      expect(runtime.scope, scopeB);

      final unauthorizedClient = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'token-b',
        authRuntime: runtime,
        transport: (_) async =>
            const ApiResponse(statusCode: 401, body: {'detail': 'expired'}),
      );
      unauthorizedClient.onAuthenticationInvalid = (_) async {
        invalidations += 1;
        await runtime.terminate(reason: '401');
      };
      await expectLater(
        unauthorizedClient.getJson('/staff/tables'),
        throwsA(isA<AuthenticationException>()),
      );
      expect(invalidations, 1);
      expect(runtime.scope, isNull);

      runtime.activate(scopeB);
      final forbiddenClient = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'token-b',
        authRuntime: runtime,
        transport: (_) async =>
            const ApiResponse(statusCode: 403, body: {'detail': 'forbidden'}),
      );
      await expectLater(
        forbiddenClient.getJson('/staff/tables'),
        throwsA(isA<PermissionDeniedException>()),
      );
      expect(runtime.scope, scopeB);
    },
  );

  test('teardown cancels delayed reconnect work', () async {
    final runtime = NativeAuthRuntime()..activate(scopeA);
    var connectionAttempts = 0;
    final client = RealtimeClient(
      baseUrl: Uri.parse('https://api.example'),
      accessToken: 'token-a',
      channel: 'operations',
      authRuntime: runtime,
      tenantScope: scopeA,
      reconnectPolicy: const ReconnectPolicy(
        initialDelay: Duration(milliseconds: 20),
        jitterRatio: 0,
      ),
      connector: (_) async {
        connectionAttempts += 1;
        throw StateError('offline');
      },
    );
    runtime.registerCleanup((_) => client.disconnect());
    await client.connect();
    expect(connectionAttempts, 1);
    await runtime.terminate(reason: 'logout');
    await Future<void>.delayed(const Duration(milliseconds: 40));
    expect(connectionAttempts, 1);
    await client.dispose();
  });
}
