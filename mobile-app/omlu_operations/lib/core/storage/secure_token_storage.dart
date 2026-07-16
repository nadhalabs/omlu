import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/role_session.dart';
import 'token_storage.dart';

class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? secureStorage})
    : _storage = secureStorage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'omlu_role_session';

  @override
  Future<void> save(RoleSession session) async {
    final rawJson = jsonEncode(session.toJson());
    await _storage.write(key: _key, value: rawJson);
  }

  @override
  Future<RoleSession?> read() async {
    try {
      final rawJson = await _storage.read(key: _key);
      if (rawJson == null) return null;
      final decoded = jsonDecode(rawJson) as Map<String, Object?>;
      return RoleSession.fromJson(decoded);
    } catch (_) {
      // If parsing fails (e.g. corrupt or incompatible schema stored), clear and return null
      await clear();
      return null;
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _key);
  }
}
