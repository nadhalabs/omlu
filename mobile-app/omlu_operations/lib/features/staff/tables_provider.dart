import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/operations_api.dart';
import '../../core/models/operations_models.dart';
import '../../core/realtime/realtime_client.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';
import 'menu_provider.dart';
import 'cart_provider.dart';

class TablesNotifier
    extends StateNotifier<AsyncValue<List<StaffTableSummary>>> {
  TablesNotifier(this._api, Ref ref) : super(const AsyncValue.loading()) {
    fetchTables();

    // Listen to realtime events to trigger re-fetch
    ref.listen(realtimeEventStreamProvider, (prev, next) {
      next.whenData((event) {
        final types = {
          'table.updated',
          'session.opened',
          'session.closed',
          'order.status_changed',
          'order.created',
          'service_request.created',
          'service_request.resolved',
          'bill.generated',
          'bill.updated',
          'bill.paid',
        };
        if (types.contains(event.type)) {
          fetchTables(silent: true);
          final selectedId = ref.read(selectedTableIdProvider);
          if (selectedId != null) {
            ref.invalidate(tableDetailProvider(selectedId));
          }
        }
      });
    });
    ref.listen(realtimeStateStreamProvider, (previous, next) {
      final previousState = previous?.valueOrNull;
      next.whenData((connection) {
        if (connection == RealtimeConnectionState.connected &&
            (previousState == RealtimeConnectionState.reconnecting ||
                previousState == RealtimeConnectionState.disconnected)) {
          fetchTables(silent: true);
        }
      });
    });
  }

  final OperationsApi _api;

  Future<void> fetchTables({bool silent = false}) async {
    if (!silent) {
      state = const AsyncValue.loading();
    }
    try {
      final tables = await _api.fetchStaffTables();
      state = AsyncValue.data(tables);
    } catch (e, st) {
      if (!silent) {
        state = AsyncValue.error(e, st);
      }
    }
  }
}

final tablesProvider =
    StateNotifierProvider<TablesNotifier, AsyncValue<List<StaffTableSummary>>>((
      ref,
    ) {
      final api = ref.watch(operationsApiProvider);
      return TablesNotifier(api, ref);
    });
