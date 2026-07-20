import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/app/app.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/login/login_screen.dart';
import 'package:omlu_operations/features/staff/staff_lock_screen.dart';
import 'package:omlu_operations/features/kitchen/kitchen_screen.dart';
import 'package:omlu_operations/features/owner/owner_screen.dart';
import 'package:omlu_operations/features/admin/admin_screen.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';

class AuthStateNotifierMock extends AuthStateNotifier {
  AuthStateNotifierMock(RoleSession? initialSession, AuthRepository repository)
    : super(repository) {
    state = AsyncData<RoleSession?>(initialSession);
  }

  @override
  Future<void> restoreSession() async {
    // Override to prevent restoring session from mock repository during instantiation
  }
}

void main() {
  late AuthRepository dummyRepository;

  setUp(() {
    final client = ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (request) async => throw UnimplementedError(),
    );
    dummyRepository = AuthRepository(
      apiClient: client,
      tokenStorage: MemoryTokenStorage(),
    );
  });

  Widget buildTestApp({required List<Override> overrides}) {
    return ProviderScope(overrides: overrides, child: const OmluNativeApp());
  }

  testWidgets('Router shows LoginScreen when unauthenticated', (tester) async {
    await tester.pumpWidget(
      buildTestApp(
        overrides: [
          authProvider.overrideWith(
            (ref) => AuthStateNotifierMock(null, dummyRepository),
          ),
        ],
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('Router shows StaffShell for staff role', (tester) async {
    final session = RoleSession(
      accessToken: 'token',
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      profile: const StaffProfile(
        name: 'Staff Alice',
        email: 'alice@example.com',
        role: StaffRole.staff,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Omlu Demo',
        restaurantSlug: 'omlu-demo',
      ),
    );
    await tester.pumpWidget(
      buildTestApp(
        overrides: [
          authProvider.overrideWith(
            (ref) => AuthStateNotifierMock(session, dummyRepository),
          ),
        ],
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(StaffAccessGate), findsOneWidget);
  });

  testWidgets('Router shows KitchenScreen for kitchen role', (tester) async {
    final session = RoleSession(
      accessToken: 'token',
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      profile: const StaffProfile(
        name: 'Kitchen Chef',
        email: 'kitchen@example.com',
        role: StaffRole.kitchen,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Omlu Demo',
        restaurantSlug: 'omlu-demo',
      ),
    );
    await tester.pumpWidget(
      buildTestApp(
        overrides: [
          authProvider.overrideWith(
            (ref) => AuthStateNotifierMock(session, dummyRepository),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(KitchenScreen), findsOneWidget);
  });

  testWidgets('Router shows OwnerScreen for owner role', (tester) async {
    final session = RoleSession(
      accessToken: 'token',
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      profile: const StaffProfile(
        name: 'Owner Boss',
        email: 'owner@example.com',
        role: StaffRole.owner,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Omlu Demo',
        restaurantSlug: 'omlu-demo',
      ),
    );
    await tester.pumpWidget(
      buildTestApp(
        overrides: [
          authProvider.overrideWith(
            (ref) => AuthStateNotifierMock(session, dummyRepository),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(OwnerScreen), findsOneWidget);
  });

  testWidgets('Router shows AdminScreen for admin role', (tester) async {
    final session = RoleSession(
      accessToken: 'token',
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      profile: const StaffProfile(
        name: 'Admin User',
        email: 'admin@example.com',
        role: StaffRole.admin,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Omlu Demo',
        restaurantSlug: 'omlu-demo',
      ),
    );
    await tester.pumpWidget(
      buildTestApp(
        overrides: [
          authProvider.overrideWith(
            (ref) => AuthStateNotifierMock(session, dummyRepository),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AdminScreen), findsOneWidget);
  });
}
