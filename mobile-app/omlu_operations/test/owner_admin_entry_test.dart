import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/printing/esc_pos_encoder.dart';
import 'package:omlu_operations/core/printing/printer_service.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/login/login_screen.dart';
import 'package:omlu_operations/features/payments/billing_counter_screen.dart';
import 'package:omlu_operations/features/printing/printer_settings_screen.dart';

import 'test_auth_fixtures.dart';

class AuthStateNotifierMock extends AuthStateNotifier {
  AuthStateNotifierMock(RoleSession? initialSession, AuthRepository repository)
      : super(repository) {
    state = AsyncData<RoleSession?>(initialSession);
  }

  @override
  Future<void> restoreSession() async {}
}

void main() {
  group('LoginScreen UI & Entry Modes', () {
    testWidgets('Shows three entry modes with correct descriptions',
        (tester) async {
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async => throw UnimplementedError(),
      );
      final repository = testAuthRepository(client, MemoryTokenStorage());

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => AuthStateNotifierMock(null, repository),
            ),
          ],
          child: const MaterialApp(home: LoginScreen()),
        ),
      );

      expect(find.text('Owner / Admin'), findsOneWidget);
      expect(find.text('Staff PIN'), findsOneWidget);
      expect(find.text('Kitchen'), findsOneWidget);

      // Default selected is Owner / Admin
      expect(
        find.text(
          'Billing, payments, printer setup and restaurant operations.',
        ),
        findsOneWidget,
      );

      // Switch to Staff PIN
      await tester.tap(find.text('Staff PIN'));
      await tester.pumpAndSettle();
      expect(
        find.text('Tables, orders and customer service.'),
        findsOneWidget,
      );

      // Switch to Kitchen
      await tester.tap(find.text('Kitchen'));
      await tester.pumpAndSettle();
      expect(
        find.text('Receive and update kitchen tickets.'),
        findsOneWidget,
      );
    });
  });

  group('Strict Role Validation in AuthRepository', () {
    test('Owner login succeeds in ownerAdmin mode', () async {
      final storage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/login') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'access_token': 'owner_jwt',
                'expires_in': 3600,
                'staff': {'role': 'owner'},
              },
            );
          }
          if (request.uri.path == '/auth/staff/me') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Owner Person',
                'email': 'owner@restaurant.com',
                'role': 'owner',
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'My Restaurant',
                'restaurant_slug': 'my-restaurant',
                'scope': {
                  'restaurant_id': 1,
                  'actor_id': 100,
                  'role': 'owner',
                  'authority_epoch': 'v1.epoch',
                },
              },
            );
          }
          if (request.uri.path == '/auth/staff/logout') {
            return const ApiResponse(
              statusCode: 200,
              body: {'success': true},
            );
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);
      final session = await repository.login(
        restaurantSlug: 'my-restaurant',
        login: 'owner',
        password: 'pass',
        entryMode: EntryMode.ownerAdmin,
      );

      expect(session.role, StaffRole.owner);
      expect(session.entryMode, EntryMode.ownerAdmin);
    });

    test('Staff login rejected when attempting Owner/Admin mode', () async {
      final storage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/login') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'access_token': 'staff_jwt',
                'expires_in': 3600,
                'staff': {'role': 'staff'},
              },
            );
          }
          if (request.uri.path == '/auth/staff/me') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Staff Bob',
                'email': 'bob@restaurant.com',
                'role': 'staff',
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'My Restaurant',
                'restaurant_slug': 'my-restaurant',
                'scope': {
                  'restaurant_id': 1,
                  'actor_id': 101,
                  'role': 'staff',
                  'authority_epoch': 'v1.epoch',
                },
              },
            );
          }
          if (request.uri.path == '/auth/staff/logout') {
            return const ApiResponse(
              statusCode: 200,
              body: {'success': true},
            );
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);

      expect(
        repository.login(
          restaurantSlug: 'my-restaurant',
          login: 'bob',
          password: 'pin',
          entryMode: EntryMode.ownerAdmin,
        ),
        throwsA(
          isA<AuthenticationException>().having(
            (e) => e.message,
            'message',
            'This account cannot use the owner/admin workspace.',
          ),
        ),
      );
    });

    test('Owner rejected when attempting Staff PIN mode', () async {
      final storage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/login') {
            return const ApiResponse(
              statusCode: 200,
              body: {
                'access_token': 'owner_jwt',
                'expires_in': 3600,
                'staff': {'role': 'owner'},
              },
            );
          }
          if (request.uri.path == '/auth/staff/me') {
            return const ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Owner Person',
                'email': 'owner@restaurant.com',
                'role': 'owner',
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'My Restaurant',
                'restaurant_slug': 'my-restaurant',
                'scope': {
                  'restaurant_id': 1,
                  'actor_id': 100,
                  'role': 'owner',
                  'authority_epoch': 'v1.epoch',
                },
              },
            );
          }
          if (request.uri.path == '/auth/staff/logout') {
            return const ApiResponse(
              statusCode: 200,
              body: {'success': true},
            );
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);

      expect(
        repository.login(
          restaurantSlug: 'my-restaurant',
          login: 'owner',
          password: 'pass',
          entryMode: EntryMode.staffPin,
        ),
        throwsA(
          isA<AuthenticationException>().having(
            (e) => e.message,
            'message',
            'This account belongs to an owner or admin. Use Owner / Admin Sign In.',
          ),
        ),
      );
    });

    test('Kitchen rejected when attempting Staff PIN mode', () async {
      final storage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/login') {
            return const ApiResponse(
              statusCode: 200,
              body: {
                'access_token': 'kitchen_jwt',
                'expires_in': 3600,
                'staff': {'role': 'kitchen'},
              },
            );
          }
          if (request.uri.path == '/auth/staff/me') {
            return const ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Chef Chef',
                'email': 'kitchen@restaurant.com',
                'role': 'kitchen',
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'My Restaurant',
                'restaurant_slug': 'my-restaurant',
                'scope': {
                  'restaurant_id': 1,
                  'actor_id': 102,
                  'role': 'kitchen',
                  'authority_epoch': 'v1.epoch',
                },
              },
            );
          }
          if (request.uri.path == '/auth/staff/logout') {
            return const ApiResponse(
              statusCode: 200,
              body: {'success': true},
            );
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);

      expect(
        repository.login(
          restaurantSlug: 'my-restaurant',
          login: 'kitchen',
          password: 'pin',
          entryMode: EntryMode.staffPin,
        ),
        throwsA(
          isA<AuthenticationException>().having(
            (e) => e.message,
            'message',
            'Use Kitchen Device to sign in with this account.',
          ),
        ),
      );
    });
  });

  group('Session Restoration & Tamper Protection', () {
    test('Tampered entryMode during session restoration is rejected', () async {
      final storage = MemoryTokenStorage();
      final tamperedSession = RoleSession(
        accessToken: 'tampered_jwt',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        profile: const StaffProfile(
          name: 'Staff Charlie',
          email: 'charlie@example.com',
          role: StaffRole.staff,
          status: 'active',
          mustChangePassword: false,
          restaurantName: 'Omlu Restaurant',
          restaurantSlug: 'omlu-slug',
        ),
        tenantScope: testScopeFor(StaffRole.staff),
        entryMode: EntryMode.ownerAdmin, // Tampered! Staff user claiming ownerAdmin
      );
      await storage.save(tamperedSession);

      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/me') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Staff Charlie',
                'email': 'charlie@example.com',
                'role': 'staff', // Authoritative role is staff
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'Omlu Restaurant',
                'restaurant_slug': 'omlu-slug',
                'scope': {
                  'restaurant_id': 1,
                  'actor_id': 103,
                  'role': 'staff',
                  'authority_epoch': 'v1.epoch',
                },
              },
            );
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);
      final restored = await repository.restore();

      expect(restored, isNull);
      expect(await storage.read(), isNull);
    });
  });

  group('Printer Settings Persistence Across Teardowns', () {
    test('Printer settings survive logout and token clearing', () async {
      final kvStorage = MemoryKeyValueStorage();
      final printerService = PrinterService(storage: kvStorage);

      const config = PrinterConfig(
        enabled: true,
        tcpIpAddress: '192.168.1.200',
        tcpPort: 9100,
        paperWidth: PaperWidth.mm80,
        copies: 2,
        autoCut: true,
      );

      await printerService.saveConfig(config);

      final tokenStorage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async => ApiResponse(statusCode: 200, body: '{}'),
      );
      final repository = testAuthRepository(client, tokenStorage);

      // Perform logout
      await repository.logout();

      // Verify auth token is cleared
      expect(await tokenStorage.read(), isNull);

      // Verify printer configuration is preserved
      final restoredConfig = await printerService.loadConfig();
      expect(restoredConfig.enabled, isTrue);
      expect(restoredConfig.tcpIpAddress, '192.168.1.200');
      expect(restoredConfig.copies, 2);
    });
  });

  group('PrinterSetup Access & Route Guards', () {
    testWidgets('Owner and Admin see Printer Setup in Billing Counter',
        (tester) async {
      final session = RoleSession(
        accessToken: 'token',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        profile: const StaffProfile(
          name: 'Owner Alice',
          email: 'alice@example.com',
          role: StaffRole.owner,
          status: 'active',
          mustChangePassword: false,
          restaurantName: 'Omlu Restaurant',
          restaurantSlug: 'omlu-slug',
        ),
        tenantScope: testScopeFor(StaffRole.owner),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => AuthStateNotifierMock(session, testAuthRepository(ApiClient(baseUrl: Uri.parse('https://api.example'), transport: (_) async => ApiResponse(statusCode: 200, body: '{}')), MemoryTokenStorage())),
            ),
          ],
          child: const MaterialApp(
            home: BillingCounterScreen(actorRole: StaffRole.owner),
          ),
        ),
      );

      expect(find.byTooltip('Printer setup'), findsOneWidget);
    });

    testWidgets('Staff users are blocked from PrinterSettingsScreen',
        (tester) async {
      final session = RoleSession(
        accessToken: 'token',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        profile: const StaffProfile(
          name: 'Staff Dave',
          email: 'dave@example.com',
          role: StaffRole.staff,
          status: 'active',
          mustChangePassword: false,
          restaurantName: 'Omlu Restaurant',
          restaurantSlug: 'omlu-slug',
        ),
        tenantScope: testScopeFor(StaffRole.staff),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => AuthStateNotifierMock(session, testAuthRepository(ApiClient(baseUrl: Uri.parse('https://api.example'), transport: (_) async => ApiResponse(statusCode: 200, body: '{}')), MemoryTokenStorage())),
            ),
          ],
          child: const MaterialApp(home: PrinterSettingsScreen()),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.text('Access Denied'), findsOneWidget);
      expect(
        find.text('Printer setup is reserved for owners and administrators.'),
        findsOneWidget,
      );
    });

    test('Account with must_change_password=true throws clear reset-required exception', () async {
      final storage = MemoryTokenStorage();
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/auth/staff/login') {
            return const ApiResponse(
              statusCode: 200,
              body: {'access_token': 'flagged_jwt', 'expires_in': 3600, 'staff': {'role': 'admin'}},
            );
          }
          if (request.uri.path == '/auth/staff/me') {
            return const ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Flagged Admin',
                'email': 'flagged@example.com',
                'role': 'admin',
                'status': 'active',
                'must_change_password': true,
                'restaurant_name': 'My Restaurant',
                'restaurant_slug': 'my-restaurant',
                'scope': {'restaurant_id': 1, 'actor_id': 200, 'role': 'admin', 'authority_epoch': 'v1.epoch'},
              },
            );
          }
          if (request.uri.path == '/auth/staff/logout') {
            return const ApiResponse(statusCode: 200, body: {'success': true});
          }
          throw UnimplementedError(request.uri.path);
        },
      );

      final repository = testAuthRepository(client, storage);

      expect(
        repository.login(
          restaurantSlug: 'my-restaurant',
          login: 'flagged_admin',
          password: 'password123',
          entryMode: EntryMode.ownerAdmin,
        ),
        throwsA(
          isA<AuthenticationException>().having(
            (e) => e.message,
            'message',
            'This account requires a password reset by the restaurant owner.',
          ),
        ),
      );
    });
  });
}
