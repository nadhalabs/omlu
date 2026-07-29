import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'test_auth_fixtures.dart';
import 'package:omlu_operations/features/staff/menu_provider.dart';

void main() {
  test(
    'background refresh retains the current menu until replacement succeeds',
    () async {
      final response = Completer<ApiResponse>();
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://omlu-api.onrender.com'),
          transport: (_) => response.future,
        ),
      );
      final notifier = MenuNotifier(
        cache: testAuthenticatedCache().cache,
        api: api,
        tableId: 7,
        restaurantScope: 'restaurant-a',
        startLoading: false,
      );
      notifier.state = const AsyncValue.data(
        MenuViewData(
          categories: [MenuCategory(id: 1, name: 'Saved', items: [])],
        ),
      );

      final refresh = notifier.refreshInBackground();
      expect(notifier.state.valueOrNull!.categories.single.name, 'Saved');
      expect(notifier.state.valueOrNull!.isRefreshing, true);

      response.complete(
        const ApiResponse(
          statusCode: 200,
          body: {
            'menu_categories': [
              {'id': 2, 'name_en': 'Fresh', 'items': []},
            ],
          },
        ),
      );
      await refresh;
      expect(notifier.state.valueOrNull!.categories.single.name, 'Fresh');
      expect(notifier.state.valueOrNull!.isRefreshing, false);
    },
  );

  test('cached menu remains visible when network refresh fails', () async {
    final cache = testAuthenticatedCache().cache;
    await cache.write('staff-menu', [
      {
        'id': 1,
        'name_en': 'Cached',
        'items': [
          {'id': 11, 'name_en': 'Saved item', 'price': 45},
        ],
      },
    ], identifier: 'table:8');
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://omlu-api.onrender.com'),
        transport: (_) async => throw const ApiException('offline'),
      ),
    );
    final notifier = MenuNotifier(
      cache: cache,
      api: api,
      tableId: 8,
      restaurantScope: 'restaurant-a',
      startLoading: false,
    );

    await notifier.load();
    final value = notifier.state.valueOrNull!;
    expect(value.categories.single.name, 'Cached');
    expect(value.categories.single.items.single.name, 'Saved item');
    expect(value.showingCached, true);
    expect(value.refreshWarning, true);
  });

  test('failed initial load exits loading and retry can succeed', () async {
    var shouldFail = true;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://omlu-api.onrender.com'),
        transport: (_) async {
          if (shouldFail) throw const ApiException('offline');
          return const ApiResponse(
            statusCode: 200,
            body: {
              'menu_categories': [
                {
                  'id': 1,
                  'name_en': 'Recovered',
                  'items': [
                    {'id': 1, 'name_en': 'Tea', 'price': '20.00'},
                  ],
                },
              ],
            },
          );
        },
      ),
    );
    final notifier = MenuNotifier(
      cache: testAuthenticatedCache().cache,
      api: api,
      tableId: 9,
      restaurantScope: 'restaurant-b',
      startLoading: false,
    );

    await notifier.load();
    expect(notifier.state.hasError, true);
    shouldFail = false;
    await notifier.retry();
    expect(notifier.state.hasValue, true);
    expect(notifier.state.valueOrNull!.categories.single.name, 'Recovered');
  });
}
