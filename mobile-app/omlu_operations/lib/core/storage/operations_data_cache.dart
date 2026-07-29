import 'dart:convert';

import '../auth/flutter_tenant_scope.dart';
import '../auth/native_auth_runtime.dart';
import 'key_value_storage.dart';

/// Scoped cache for non-transactional authenticated operational reference data.
class OperationsDataCache {
  OperationsDataCache({
    required NativeAuthRuntime authRuntime,
    KeyValueStorage? storage,
    ScopedStorageKeyBuilder keyBuilder = const ScopedStorageKeyBuilder(),
  }) : _authRuntime = authRuntime,
       _storage = storage ?? SecureKeyValueStorage(),
       _keyBuilder = keyBuilder;

  final NativeAuthRuntime _authRuntime;
  final KeyValueStorage _storage;
  final ScopedStorageKeyBuilder _keyBuilder;
  final Map<String, _MemoryEntry> _memory = {};

  static const legacyPrefixes = <String>[
    'omlu_reference_cache_v1_',
    'staff_access_v1_',
    'tables_all',
    'staff_cart',
    'selected_table',
    'kitchen_orders',
    'pending_payments',
  ];
  static const authenticatedPrefix = 'omlu:v2:';

  String scopedKey(String feature, {String identifier = 'all'}) {
    final scope = _authRuntime.scope;
    if (scope == null || !_authRuntime.isActive) {
      throw StateError('Operational cache requested before /me validation.');
    }
    return _keyBuilder.build(scope, feature: feature, identifier: identifier);
  }

  Future<void> initializeScope() async {
    _authRuntime.capture();
    await removeLegacyAuthenticatedData();
  }

  Future<Object?> read(
    String feature, {
    String identifier = 'all',
    required Duration maxAge,
  }) async {
    final lease = _authRuntime.capture();
    final key = scopedKey(feature, identifier: identifier);
    final memory = _memory[key];
    if (memory != null && DateTime.now().difference(memory.savedAt) <= maxAge) {
      _authRuntime.ensureCurrent(lease);
      return memory.value;
    }
    try {
      final raw = await _storage.read(key);
      _authRuntime.ensureCurrent(lease);
      if (raw == null) return null;
      final decoded = Map<String, Object?>.from(jsonDecode(raw) as Map);
      final savedAt = DateTime.parse(decoded['saved_at']! as String);
      if (DateTime.now().difference(savedAt) > maxAge) return null;
      final value = decoded['value'];
      _memory[key] = _MemoryEntry(value, savedAt);
      return value;
    } on StaleNativeAuthorityException {
      rethrow;
    } catch (_) {
      return null;
    }
  }

  Future<void> write(
    String feature,
    Object? value, {
    String identifier = 'all',
  }) async {
    final lease = _authRuntime.capture();
    final key = scopedKey(feature, identifier: identifier);
    final savedAt = DateTime.now();
    _authRuntime.ensureCurrent(lease);
    _memory[key] = _MemoryEntry(value, savedAt);
    try {
      await _storage.write(
        key,
        jsonEncode({'saved_at': savedAt.toIso8601String(), 'value': value}),
      );
      _authRuntime.ensureCurrent(lease);
    } on StaleNativeAuthorityException {
      _memory.remove(key);
      rethrow;
    } catch (_) {
      // Storage failure must not turn an authoritative API success into failure.
    }
  }

  Future<void> invalidate(String feature, {String identifier = 'all'}) async {
    final key = scopedKey(feature, identifier: identifier);
    _memory.remove(key);
    try {
      await _storage.delete(key);
    } catch (_) {}
  }

  Future<void> clearAuthenticatedData() async {
    _memory.clear();
    final all = await _storage.readAll();
    for (final key in all.keys) {
      if (key.startsWith(authenticatedPrefix) ||
          legacyPrefixes.any(key.startsWith)) {
        await _storage.delete(key);
      }
    }
  }

  Future<void> removeLegacyAuthenticatedData() async {
    final all = await _storage.readAll();
    for (final key in all.keys) {
      if (legacyPrefixes.any(key.startsWith)) await _storage.delete(key);
    }
  }
}

class _MemoryEntry {
  const _MemoryEntry(this.value, this.savedAt);
  final Object? value;
  final DateTime savedAt;
}
