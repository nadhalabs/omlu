import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/storage/secure_token_storage.dart';

class MockFlutterSecureStorage extends FlutterSecureStorage {
  final Map<String, String> _data = {};

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    return _data[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    if (value == null) {
      _data.remove(key);
    } else {
      _data[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    _data.remove(key);
  }

  @override
  Future<bool> containsKey({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    return _data.containsKey(key);
  }

  @override
  Future<Map<String, String>> readAll({
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    return Map.of(_data);
  }

  @override
  Future<void> deleteAll({
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) async {
    _data.clear();
  }
}

void main() {
  group('SecureTokenStorage', () {
    late MockFlutterSecureStorage mockSecureStorage;
    late SecureTokenStorage tokenStorage;

    final session = RoleSession(
      accessToken: 'test-token',
      expiresAt: DateTime.utc(2026, 7, 16, 12, 0, 0),
      profile: const StaffProfile(
        name: 'Jane Doe',
        username: 'jane',
        email: 'jane@example.com',
        role: StaffRole.staff,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Test Diner',
        restaurantSlug: 'test-diner',
      ),
    );

    setUp(() {
      mockSecureStorage = MockFlutterSecureStorage();
      tokenStorage = SecureTokenStorage(secureStorage: mockSecureStorage);
    });

    test('saves and reads role session successfully', () async {
      await tokenStorage.save(session);
      final readSession = await tokenStorage.read();

      expect(readSession, isNotNull);
      expect(readSession!.accessToken, 'test-token');
      expect(readSession.profile.role, StaffRole.staff);
      expect(readSession.profile.name, 'Jane Doe');
      expect(readSession.expiresAt, session.expiresAt);
    });

    test('returns null when no session is stored', () async {
      final readSession = await tokenStorage.read();
      expect(readSession, isNull);
    });

    test('clears stored session successfully', () async {
      await tokenStorage.save(session);
      expect(await tokenStorage.read(), isNotNull);

      await tokenStorage.clear();
      expect(await tokenStorage.read(), isNull);
    });

    test(
      'handles corrupted JSON by clearing storage and returning null',
      () async {
        // Write invalid JSON format directly to secure storage
        await mockSecureStorage.write(
          key: 'omlu_role_session',
          value: 'invalid-json-content',
        );

        final readSession = await tokenStorage.read();
        expect(readSession, isNull);

        // Verify that storage has been cleared
        final rawVal = await mockSecureStorage.read(key: 'omlu_role_session');
        expect(rawVal, isNull);
      },
    );
  });
}
