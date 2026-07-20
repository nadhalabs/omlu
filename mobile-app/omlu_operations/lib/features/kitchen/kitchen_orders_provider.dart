import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/operations_api.dart';
import '../../core/models/operations_models.dart';
import '../../core/realtime/realtime_client.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';

class KitchenOrdersNotifier
    extends StateNotifier<AsyncValue<List<KitchenOrder>>> {
  KitchenOrdersNotifier(this._api, this._restaurantSlug, Ref ref)
    : super(const AsyncValue.loading()) {
    fetchOrders();

    // Listen to realtime events to refresh the kitchen board
    ref.listen(realtimeEventStreamProvider, (prev, next) {
      next.whenData((event) {
        if (event.type == 'order.created' ||
            event.type == 'order.status_changed') {
          fetchOrders(silent: true);
        }
      });
    });
    ref.listen(realtimeStateStreamProvider, (previous, next) {
      final previousState = previous?.valueOrNull;
      next.whenData((connection) {
        if (connection == RealtimeConnectionState.connected &&
            (previousState == RealtimeConnectionState.reconnecting ||
                previousState == RealtimeConnectionState.disconnected)) {
          fetchOrders(silent: true);
        }
      });
    });
  }

  final OperationsApi _api;
  final String _restaurantSlug;

  Future<void> fetchOrders({bool silent = false}) async {
    if (!silent) {
      state = const AsyncValue.loading();
    }
    try {
      final orders = await _api.fetchKitchenOrders(
        restaurantSlug: _restaurantSlug,
        status: 'pending,accepted,preparing,ready',
      );
      state = AsyncValue.data(orders);
    } catch (e, st) {
      if (!silent) {
        state = AsyncValue.error(e, st);
      }
    }
  }

  Future<void> advanceStatus(String publicToken, String currentStatus) async {
    if (currentStatus == 'pending') {
      await _api.updateKitchenStatus(
        restaurantSlug: _restaurantSlug,
        publicToken: publicToken,
        status: 'accepted',
      );
      currentStatus = 'accepted';
    }
    final nextStatus = switch (currentStatus) {
      'accepted' => 'preparing',
      'preparing' => 'ready',
      'ready' => 'served',
      _ => null,
    };

    if (nextStatus == null) return;

    try {
      await _api.updateKitchenStatus(
        restaurantSlug: _restaurantSlug,
        publicToken: publicToken,
        status: nextStatus,
      );
      await fetchOrders(silent: true);
    } catch (e) {
      rethrow;
    }
  }
}

final kitchenOrdersProvider =
    StateNotifierProvider<
      KitchenOrdersNotifier,
      AsyncValue<List<KitchenOrder>>
    >((ref) {
      final api = ref.watch(operationsApiProvider);
      final authState = ref.watch(authProvider);
      final slug = authState.value?.restaurantSlug ?? 'demo';
      return KitchenOrdersNotifier(api, slug, ref);
    });
