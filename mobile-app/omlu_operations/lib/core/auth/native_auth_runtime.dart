import 'dart:async';

import 'flutter_tenant_scope.dart';

enum NativeAuthPhase { anonymous, active, terminating }

class NativeAuthorityLease {
  const NativeAuthorityLease(this.generation, this.scope);
  final int generation;
  final FlutterTenantScope scope;
}

typedef NativeAuthCleanup = FutureOr<void> Function(String reason);

class NativeAuthRuntime {
  FlutterTenantScope? _scope;
  NativeAuthPhase _phase = NativeAuthPhase.anonymous;
  int _generation = 0;
  Future<void>? _termination;
  final Set<NativeAuthCleanup> _cleanups = {};

  FlutterTenantScope? get scope => _scope;
  NativeAuthPhase get phase => _phase;
  int get generation => _generation;
  bool get isActive => _phase == NativeAuthPhase.active && _scope != null;

  void activate(FlutterTenantScope scope) {
    if (_phase == NativeAuthPhase.terminating) {
      throw StateError('Native authentication teardown is in progress.');
    }
    if (_scope != null && _scope != scope) {
      throw StateError('Previous native authority must be torn down first.');
    }
    if (_scope == null) _generation += 1;
    _scope = scope;
    _phase = NativeAuthPhase.active;
  }

  NativeAuthorityLease capture() {
    final current = _scope;
    if (_phase != NativeAuthPhase.active || current == null) {
      throw StateError('Authenticated operation requested without scope.');
    }
    return NativeAuthorityLease(_generation, current);
  }

  bool isCurrent(NativeAuthorityLease lease) =>
      _phase == NativeAuthPhase.active &&
      lease.generation == _generation &&
      lease.scope == _scope;

  void ensureCurrent(NativeAuthorityLease lease) {
    if (!isCurrent(lease)) throw const StaleNativeAuthorityException();
  }

  void Function() registerCleanup(NativeAuthCleanup cleanup) {
    _cleanups.add(cleanup);
    return () => _cleanups.remove(cleanup);
  }

  Future<void> terminate({required String reason}) {
    final existing = _termination;
    if (existing != null) return existing;
    _phase = NativeAuthPhase.terminating;
    _generation += 1;
    final callbacks = List<NativeAuthCleanup>.from(_cleanups);
    final completer = Completer<void>();
    _termination = completer.future;
    () async {
      for (final callback in callbacks) {
        try {
          await callback(reason);
        } catch (_) {
          // Local authority termination continues even if one cleanup fails.
        }
      }
      _scope = null;
      _phase = NativeAuthPhase.anonymous;
      _termination = null;
      completer.complete();
    }();
    return completer.future;
  }
}

class StaleNativeAuthorityException implements Exception {
  const StaleNativeAuthorityException();

  @override
  String toString() => 'Response belongs to a terminated native authority.';
}
