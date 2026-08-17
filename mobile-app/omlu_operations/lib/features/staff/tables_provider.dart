import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/operations_api.dart';
import '../../core/api/api_exceptions.dart';
import '../../core/models/operations_models.dart';
import '../../core/realtime/realtime_client.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';
import 'menu_provider.dart';
import 'cart_provider.dart';

class TablesNotifier
    extends StateNotifier<AsyncValue<List<StaffTableSummary>>> {
  TablesNotifier(this._api, Ref ref) : super(const AsyncValue.loading()) {
    _ref = ref;
    fetchTables();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => fetchTables(silent: true),
    );

    // Listen to realtime events to trigger re-fetch
    ref.listen(realtimeEventStreamProvider, (prev, next) {
      next.whenData((event) {
        final types = {
          'table.updated',
          'session.opened',
          'session.closed',
          'order.status_changed',
          'order.created',
          'order.item_cancelled',
          'service_request.created',
          'service_request.resolved',
          'bill.generated',
          'bill.updated',
          'bill.sent_to_counter',
          'bill.payment_pending',
          'bill.payment_recorded',
          'bill.paid',
          'table.status_changed',
          'empty_table.reported',
          'empty_table.dismissed',
          'empty_table.resolved',
          'session.force_closed',
          'session.orders_cancelled',
          'bill.draft_voided',
        };
        if (types.contains(event.type) &&
            (!_isEmptyTableEvent(event) ||
                _eventBelongsToCurrentTenant(event))) {
          if (_isEmptyTableEvent(event) &&
              !_eventMatchesCurrentSession(event)) {
            return;
          }
          if (event.type == 'session.force_closed') {
            final selectedId = ref.read(selectedTableIdProvider);
            if (selectedId == _eventTableId(event)) {
              ref.read(selectedTableIdProvider.notifier).state = null;
              ref.read(forcedSessionClosureNoticeProvider.notifier).state =
                  'This table session was closed by the owner or admin.';
            }
          } else if (event.type == 'empty_table.dismissed' ||
              event.type == 'empty_table.resolved') {
            final tableId = _eventTableId(event);
            if (tableId != null) {
              ref
                  .read(emptyTableReportProvider(tableId).notifier)
                  .reconcile(null);
            }
          }
          fetchTables(silent: true);
          final selectedId = ref.read(selectedTableIdProvider);
          if (selectedId != null) {
            ref.invalidate(tableDetailProvider(selectedId));
            ref
                .read(menuViewProvider(selectedId).notifier)
                .refreshInBackground();
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
  late final Ref _ref;
  Timer? _pollTimer;
  Future<void>? _activeFetch;
  bool _refreshQueued = false;

  int? _eventTableId(RealtimeEvent event) =>
      int.tryParse(event.state['table_id']?.toString() ?? '');

  bool _isEmptyTableEvent(RealtimeEvent event) => {
    'empty_table.reported',
    'empty_table.dismissed',
    'empty_table.resolved',
    'session.force_closed',
    'session.orders_cancelled',
    'bill.draft_voided',
  }.contains(event.type);

  bool _eventBelongsToCurrentTenant(RealtimeEvent event) {
    final restaurantId = _ref
        .read(authProvider)
        .valueOrNull
        ?.tenantScope
        .restaurantId;
    return restaurantId != null && event.restaurantId == restaurantId;
  }

  bool _eventMatchesCurrentSession(RealtimeEvent event) {
    final tableId = _eventTableId(event);
    final sessionToken = event.state['session_token']?.toString();
    if (tableId == null || sessionToken == null || sessionToken.isEmpty) {
      return false;
    }
    final table = state.valueOrNull
        ?.where((candidate) => candidate.id == tableId)
        .firstOrNull;
    return table?.sessionToken == sessionToken;
  }

  Future<void> fetchTables({bool silent = false}) {
    final activeFetch = _activeFetch;
    if (activeFetch != null) {
      // Coalesce overlapping poll/realtime/manual triggers. One follow-up keeps
      // changes committed after the active request began from being lost.
      _refreshQueued = true;
      return activeFetch;
    }

    final request = _fetchTables(silent: silent);
    _activeFetch = request;
    request.whenComplete(() {
      if (identical(_activeFetch, request)) _activeFetch = null;
      if (_refreshQueued && mounted) {
        _refreshQueued = false;
        fetchTables(silent: true);
      }
    });
    return request;
  }

  Future<void> _fetchTables({required bool silent}) async {
    if (!silent && !state.hasValue) {
      state = const AsyncValue.loading();
    }
    try {
      final previousTables = state.valueOrNull;
      final tables = await _api.fetchStaffTables(forceRefresh: silent);
      if (mounted) {
        state = AsyncValue.data(tables);
        final selectedId = _ref.read(selectedTableIdProvider);
        if (selectedId != null) {
          final current = tables
              .where((table) => table.id == selectedId)
              .firstOrNull;
          final previous = previousTables
              ?.where((table) => table.id == selectedId)
              .firstOrNull;
          if (current == null ||
              !current.hasOpenSession ||
              (previous?.sessionToken != null &&
                  current.sessionToken != previous!.sessionToken)) {
            _ref.read(selectedTableIdProvider.notifier).state = null;
            _ref.invalidate(tableDetailProvider(selectedId));
          } else {
            _ref
                .read(emptyTableReportProvider(selectedId).notifier)
                .reconcile(current.emptyTableReport);
          }
        }
      }
    } catch (e, st) {
      if (mounted && !state.hasValue) {
        state = AsyncValue.error(e, st);
      }
    }
  }

  void applyReportedState({
    required int tableId,
    required String sessionToken,
    required EmptyTableReport report,
  }) {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncValue.data([
      for (final table in current)
        if (table.id == tableId && table.sessionToken == sessionToken)
          table.copyWith(emptyTableReport: report)
        else
          table,
    ]);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}

final tablesProvider =
    StateNotifierProvider<TablesNotifier, AsyncValue<List<StaffTableSummary>>>((
      ref,
    ) {
      ref.watch(authProvider).valueOrNull?.tenantScope;
      final api = ref.watch(operationsApiProvider);
      return TablesNotifier(api, ref);
    });

final forcedSessionClosureNoticeProvider = StateProvider<String?>(
  (ref) => null,
);

class EmptyTableReportNotifier
    extends StateNotifier<AsyncValue<EmptyTableReport?>> {
  EmptyTableReportNotifier(this._api, this._ref, this._tableId)
    : super(const AsyncValue.data(null));

  final OperationsApi _api;
  final Ref _ref;
  final int _tableId;

  Future<bool> submit(String expectedSessionToken) async {
    if (state.isLoading) return false;
    state = const AsyncValue.loading();
    try {
      final detail = StaffTableSummary.fromDetailJson(
        await _api.fetchStaffTableDetail(_tableId),
      );
      if (!detail.hasOpenSession ||
          detail.sessionToken != expectedSessionToken) {
        throw const ConflictException('Active session changed.');
      }
      if (detail.emptyTableReport != null) {
        throw const ConflictException('Empty table already reported.');
      }
      final report = await _api.reportTableEmpty(
        tableId: _tableId,
        sessionToken: expectedSessionToken,
      );
      if (report.sessionToken != expectedSessionToken) {
        throw const ConflictException('Active session changed.');
      }
      if (!mounted) return false;
      state = AsyncValue.data(report);
      _ref
          .read(tablesProvider.notifier)
          .applyReportedState(
            tableId: _tableId,
            sessionToken: expectedSessionToken,
            report: report,
          );
      _ref.invalidate(tableDetailProvider(_tableId));
      return true;
    } catch (error, stackTrace) {
      if (mounted) state = AsyncValue.error(error, stackTrace);
      _ref.invalidate(tableDetailProvider(_tableId));
      await _ref.read(tablesProvider.notifier).fetchTables(silent: true);
      return false;
    }
  }

  void reconcile(EmptyTableReport? report) {
    if (!mounted || state.isLoading) return;
    state = AsyncValue.data(report);
  }
}

final emptyTableReportProvider = StateNotifierProvider.autoDispose
    .family<EmptyTableReportNotifier, AsyncValue<EmptyTableReport?>, int>((
      ref,
      tableId,
    ) {
      return EmptyTableReportNotifier(
        ref.watch(operationsApiProvider),
        ref,
        tableId,
      );
    });
