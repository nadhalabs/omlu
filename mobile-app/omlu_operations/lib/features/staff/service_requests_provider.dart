import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/operations_api.dart';
import '../../core/realtime/realtime_client.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';

class ServiceRequestsNotifier extends StateNotifier<AsyncValue<List<dynamic>>> {
  ServiceRequestsNotifier(this._api, Ref ref)
    : super(const AsyncValue.loading()) {
    fetchRequests();

    // Listen to WebSocket events to update list in real-time
    ref.listen(realtimeEventStreamProvider, (prev, next) {
      next.whenData((event) {
        if (event.type == 'service_request.created' ||
            event.type == 'service_request.resolved') {
          fetchRequests(silent: true);
        }
      });
    });
    ref.listen(realtimeStateStreamProvider, (previous, next) {
      final previousState = previous?.valueOrNull;
      next.whenData((connection) {
        if (connection == RealtimeConnectionState.connected &&
            (previousState == RealtimeConnectionState.reconnecting ||
                previousState == RealtimeConnectionState.disconnected)) {
          fetchRequests(silent: true);
        }
      });
    });
  }

  final OperationsApi _api;

  Future<void> fetchRequests({bool silent = false}) async {
    if (!silent) {
      state = const AsyncValue.loading();
    }
    try {
      final list = await _api.fetchServiceRequests(statusFilter: 'all');
      if (mounted) state = AsyncValue.data(list);
    } catch (e, st) {
      if (mounted && !silent) {
        state = AsyncValue.error(e, st);
      }
    }
  }

  Future<void> resolveRequest(int requestId) async {
    try {
      await _api.resolveServiceRequest(requestId);
      await fetchRequests(silent: true);
    } catch (e) {
      rethrow;
    }
  }
}

final serviceRequestsProvider =
    StateNotifierProvider<ServiceRequestsNotifier, AsyncValue<List<dynamic>>>((
      ref,
    ) {
      final api = ref.watch(operationsApiProvider);
      return ServiceRequestsNotifier(api, ref);
    });

// Active pending requests count for bottom navigation badge
final activeRequestsCountProvider = Provider<int>((ref) {
  final state = ref.watch(serviceRequestsProvider);
  return state.maybeWhen(
    data: (list) {
      return list.where((req) {
        if (req is! Map) return false;
        final status = req['status']?.toString().toLowerCase();
        final resolvedAt = req['resolved_at'];
        return status == 'pending' || resolvedAt == null;
      }).length;
    },
    orElse: () => 0,
  );
});
