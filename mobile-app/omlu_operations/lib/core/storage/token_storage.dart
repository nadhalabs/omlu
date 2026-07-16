import '../models/role_session.dart';

abstract interface class TokenStorage {
  Future<void> save(RoleSession session);

  Future<RoleSession?> read();

  Future<void> clear();
}

class MemoryTokenStorage implements TokenStorage {
  RoleSession? _session;

  @override
  Future<void> save(RoleSession session) async {
    _session = session;
  }

  @override
  Future<RoleSession?> read() async => _session;

  @override
  Future<void> clear() async {
    _session = null;
  }
}
