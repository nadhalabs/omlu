import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Small cache for non-transactional operational reference data.
///
/// PostgreSQL/API responses remain authoritative. Payment, bill, session and
/// order mutation responses are deliberately never persisted here.
class OperationsDataCache {
  OperationsDataCache({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  final Map<String, _MemoryEntry> _memory = {};
  static const _prefix = 'omlu_reference_cache_v1_';

  Future<Object?> read(String key, {required Duration maxAge}) async {
    final memory = _memory[key];
    if (memory != null && DateTime.now().difference(memory.savedAt) <= maxAge) {
      return memory.value;
    }
    try {
      final raw = await _storage.read(key: '$_prefix$key');
      if (raw == null) return null;
      final decoded = Map<String, Object?>.from(jsonDecode(raw) as Map);
      final savedAt = DateTime.parse(decoded['saved_at']! as String);
      if (DateTime.now().difference(savedAt) > maxAge) return null;
      final value = decoded['value'];
      _memory[key] = _MemoryEntry(value, savedAt);
      return value;
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String key, Object? value) async {
    final savedAt = DateTime.now();
    _memory[key] = _MemoryEntry(value, savedAt);
    try {
      await _storage.write(
        key: '$_prefix$key',
        value: jsonEncode({
          'saved_at': savedAt.toIso8601String(),
          'value': value,
        }),
      );
    } catch (_) {
      // A storage failure must never turn a successful API request into a failure.
    }
  }

  Future<void> invalidate(String key) async {
    _memory.remove(key);
    try {
      await _storage.delete(key: '$_prefix$key');
    } catch (_) {}
  }
}

class _MemoryEntry {
  const _MemoryEntry(this.value, this.savedAt);
  final Object? value;
  final DateTime savedAt;
}
