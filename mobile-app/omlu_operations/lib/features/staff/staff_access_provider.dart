import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api/api_exceptions.dart';
import '../../core/models/role_session.dart';
import '../../core/realtime/realtime_client.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';
import 'menu_provider.dart';
import 'service_requests_provider.dart';
import 'tables_provider.dart';

enum StaffLockKind { individual, global, restaurantClosed }

class StaffAccessState {
  const StaffAccessState({
    this.loading = true,
    this.individualLocked = false,
    this.globalLocked = false,
    this.restaurantClosed = false,
    this.lockedBy,
    this.reason,
    this.lockedAt,
    this.operationsRestored = false,
  });

  final bool loading;
  final bool individualLocked;
  final bool globalLocked;
  final bool restaurantClosed;
  final String? lockedBy;
  final String? reason;
  final DateTime? lockedAt;
  final bool operationsRestored;

  bool get locked => individualLocked || globalLocked || restaurantClosed;
  StaffLockKind get kind => restaurantClosed
      ? StaffLockKind.restaurantClosed
      : globalLocked
      ? StaffLockKind.global
      : StaffLockKind.individual;

  StaffAccessState copyWith({
    bool? loading,
    bool? individualLocked,
    bool? globalLocked,
    bool? restaurantClosed,
    String? lockedBy,
    String? reason,
    DateTime? lockedAt,
    bool clearDetails = false,
    bool? operationsRestored,
  }) => StaffAccessState(
    loading: loading ?? this.loading,
    individualLocked: individualLocked ?? this.individualLocked,
    globalLocked: globalLocked ?? this.globalLocked,
    restaurantClosed: restaurantClosed ?? this.restaurantClosed,
    lockedBy: clearDetails ? null : lockedBy ?? this.lockedBy,
    reason: clearDetails ? null : reason ?? this.reason,
    lockedAt: clearDetails ? null : lockedAt ?? this.lockedAt,
    operationsRestored: operationsRestored ?? this.operationsRestored,
  );

  Map<String, Object?> toJson() => {
    'individual': individualLocked,
    'global': globalLocked,
    'closed': restaurantClosed,
    if (lockedBy != null) 'by': lockedBy,
    if (reason != null) 'reason': reason,
    if (lockedAt != null) 'at': lockedAt!.toUtc().toIso8601String(),
  };

  factory StaffAccessState.fromJson(Map<String, Object?> json) =>
      StaffAccessState(
        loading: false,
        individualLocked: json['individual'] as bool? ?? false,
        globalLocked: json['global'] as bool? ?? false,
        restaurantClosed: json['closed'] as bool? ?? false,
        lockedBy: json['by'] as String?,
        reason: json['reason'] as String?,
        lockedAt: DateTime.tryParse(json['at'] as String? ?? ''),
      );
}

class StaffAccessNotifier extends StateNotifier<StaffAccessState>
    with WidgetsBindingObserver {
  StaffAccessNotifier(this._ref, RoleSession session)
    : _staffId = _jwtSubject(session.accessToken),
      _storageKey =
          'staff_access_v1_${session.restaurantSlug}_${session.profile.username ?? session.profile.email}',
      super(const StaffAccessState()) {
    WidgetsBinding.instance.addObserver(this);
    _ref.listen(realtimeEventStreamProvider, (_, next) {
      next.whenData(handleEvent);
    });
    _ref.listen(realtimeStateStreamProvider, (previous, next) {
      final was = previous?.valueOrNull;
      next.whenData((current) {
        handleConnectionState(was, current);
      });
    });
    _restore();
  }

  void handleConnectionState(
    RealtimeConnectionState? previous,
    RealtimeConnectionState current,
  ) {
    if (current == RealtimeConnectionState.connected &&
        (previous == RealtimeConnectionState.reconnecting ||
            previous == RealtimeConnectionState.disconnected)) {
      refreshAuthoritative();
    }
  }

  final Ref _ref;
  final String? _staffId;
  final String _storageKey;
  static const _storage = FlutterSecureStorage();
  bool _refreshing = false;

  static String? _jwtSubject(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      return payload is Map ? payload['sub']?.toString() : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _restore() async {
    try {
      final saved = await _storage.read(key: _storageKey);
      if (saved != null) {
        state = StaffAccessState.fromJson(
          Map<String, Object?>.from(jsonDecode(saved) as Map),
        );
      } else {
        state = state.copyWith(loading: false);
      }
    } catch (_) {
      state = state.copyWith(loading: false);
    }
    await refreshAuthoritative();
  }

  Future<void> _persist() async {
    try {
      await _storage.write(key: _storageKey, value: jsonEncode(state.toJson()));
    } catch (_) {}
  }

  bool _isCurrentStaffEvent(RealtimeEvent event) {
    final target = event.state['staff_id']?.toString() ?? event.resourceId;
    return _staffId != null && target == _staffId;
  }

  void handleEvent(RealtimeEvent event) {
    final eventTime = _date(event.state['locked_at']) ?? event.timestamp;
    switch (event.type) {
      case 'staff.locked':
        if (!_isCurrentStaffEvent(event)) return;
        _setLock(
          state.copyWith(
            loading: false,
            individualLocked: true,
            lockedBy: _text(event.state['locked_by']),
            reason: _text(event.state['reason']),
            lockedAt: eventTime,
          ),
        );
      case 'staff.all_locked':
        _setLock(
          state.copyWith(
            loading: false,
            globalLocked: true,
            lockedBy: _text(event.state['locked_by']),
            reason: _text(event.state['reason']),
            lockedAt: eventTime,
          ),
        );
      case 'restaurant.status_changed':
        final status = _text(event.state['status'])?.toLowerCase();
        if (status == 'closed') {
          _setLock(
            state.copyWith(
              loading: false,
              restaurantClosed: true,
              lockedBy: _text(event.state['changed_by']),
              lockedAt: event.timestamp,
            ),
          );
        } else if (state.restaurantClosed) {
          _confirmUnlock(restaurantClosed: false);
        }
      case 'staff.unlocked':
        if (_isCurrentStaffEvent(event)) _confirmUnlock(individualLocked: false);
      case 'staff.all_unlocked':
        _confirmUnlock(globalLocked: false);
    }
  }

  static String? _text(Object? value) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty || text == 'null' ? null : text;
  }

  static DateTime? _date(Object? value) =>
      DateTime.tryParse(value?.toString() ?? '');

  void _setLock(StaffAccessState next) {
    state = next.copyWith(operationsRestored: false);
    _persist();
  }

  Future<void> _confirmUnlock({
    bool? individualLocked,
    bool? globalLocked,
    bool? restaurantClosed,
  }) async {
    final before = state;
    final candidate = state.copyWith(
      individualLocked: individualLocked,
      globalLocked: globalLocked,
      restaurantClosed: restaurantClosed,
    );
    state = candidate.copyWith(loading: true);
    final confirmed = await refreshAuthoritative(
      candidate: candidate,
      announceRestore: before.locked && !candidate.locked,
    );
    if (!confirmed && mounted) state = before;
  }

  Future<bool> refreshAuthoritative({
    StaffAccessState? candidate,
    bool announceRestore = false,
  }) async {
    if (_refreshing) return false;
    _refreshing = true;
    try {
      await _ref.read(authRepositoryProvider).currentUser();
      await _ref.read(operationsApiProvider).fetchStaffTables();
      final next = (candidate ?? state).copyWith(loading: false);
      state = next.locked
          ? next
          : next.copyWith(
              clearDetails: true,
              operationsRestored: announceRestore,
            );
      await _persist();
      if (announceRestore) {
        _ref.invalidate(tablesProvider);
        _ref.invalidate(tableDetailProvider);
        _ref.invalidate(menuCategoriesProvider);
        _ref.invalidate(serviceRequestsProvider);
      }
      return true;
    } on AuthenticationException {
      await _ref.read(authProvider.notifier).logout();
      return false;
    } catch (_) {
      state = state.copyWith(loading: false);
      return false;
    } finally {
      _refreshing = false;
    }
  }

  void acknowledgeRestoreMessage() {
    if (state.operationsRestored) {
      state = state.copyWith(operationsRestored: false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refreshAuthoritative();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}

final staffAccessProvider =
    StateNotifierProvider.autoDispose<StaffAccessNotifier, StaffAccessState>((ref) {
      final session = ref.read(authProvider).value;
      if (session == null || session.role != StaffRole.staff) {
        throw StateError('Staff access state requires an active Staff session.');
      }
      return StaffAccessNotifier(ref, session);
    });
