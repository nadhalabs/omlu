import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/role_session.dart';
import 'token_storage.dart';

class StoredSessionRecoveryException implements Exception {
  const StoredSessionRecoveryException(this.message);
  final String message;

  @override
  String toString() => message;
}

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
    } on PlatformException {
      // Native storage/decryption failure: clear targeted auth session key cleanly
      try {
        await clear();
      } catch (_) {
        try {
          await _storage.deleteAll();
        } catch (_) {}
      }
      throw const StoredSessionRecoveryException(
        'Saved login information could not be restored. Please sign in again.',
      );
    } on FormatException {
      // Corrupted JSON payload: clear targeted key
      await clear();
      throw const StoredSessionRecoveryException(
        'Saved session format was invalid. Please sign in again.',
      );
    } on TypeError {
      // Incompatible session schema: clear targeted key
      await clear();
      throw const StoredSessionRecoveryException(
        'Saved session format was outdated. Please sign in again.',
      );
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _key);
  }
}
