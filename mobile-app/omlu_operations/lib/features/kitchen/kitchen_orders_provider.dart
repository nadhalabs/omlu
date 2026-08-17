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
        if (event.type == 'order.item_cancelled') {
          final current = state.valueOrNull;
          if (current != null) {
            state = AsyncValue.data([
              for (final order in current)
                order.applyItemCancellation(event.state),
            ]);
          }
        }
        if (event.type == 'order.created' ||
            event.type == 'order.status_changed' ||
            event.type == 'order.item_cancelled') {
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
  final Set<String> _updatingTokens = {};

  Future<void> fetchOrders({bool silent = false}) async {
    if (!silent && !state.hasValue) {
      state = const AsyncValue.loading();
    }
    try {
      final orders = await _api.fetchKitchenOrders(
        restaurantSlug: _restaurantSlug,
        status: 'pending,accepted,preparing,ready',
      );
      state = AsyncValue.data(orders);
    } catch (e, st) {
      if (!state.hasValue) {
        state = AsyncValue.error(e, st);
      }
    }
  }

  Future<void> advanceStatus(String publicToken, String currentStatus) async {
    if (_updatingTokens.contains(publicToken)) return;
    final nextStatus = switch (currentStatus) {
      'pending' => 'accepted',
      'accepted' => 'preparing',
      'preparing' => 'ready',
      'ready' => 'served',
      _ => null,
    };

    if (nextStatus == null) return;
    final previous = state.valueOrNull;
    if (previous == null) return;
    final target = previous
        .where((order) => order.publicToken == publicToken)
        .firstOrNull;
    if (target == null || !target.hasActionableItems) return;
    _updatingTokens.add(publicToken);
    state = AsyncValue.data(
      nextStatus == 'served'
          ? previous
                .where((order) => order.publicToken != publicToken)
                .toList(growable: false)
          : [
              for (final order in previous)
                if (order.publicToken == publicToken)
                  order.copyWith(status: nextStatus)
                else
                  order,
            ],
    );

    try {
      final updated = await _api.updateKitchenStatus(
        restaurantSlug: _restaurantSlug,
        publicToken: publicToken,
        status: nextStatus,
      );
      final current = state.valueOrNull;
      if (current != null && nextStatus != 'served') {
        state = AsyncValue.data([
          for (final order in current)
            if (order.publicToken == publicToken && order.status == nextStatus)
              updated
            else
              order,
        ]);
      }
    } catch (e) {
      state = AsyncValue.data(previous);
      rethrow;
    } finally {
      _updatingTokens.remove(publicToken);
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
