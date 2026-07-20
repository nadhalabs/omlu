import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/app/app.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/login/login_screen.dart';
import 'package:omlu_operations/features/staff/staff_access_provider.dart';
import 'package:omlu_operations/features/staff/staff_lock_screen.dart';

class _AuthMock extends AuthStateNotifier {
  _AuthMock(RoleSession session, AuthRepository repository) : super(repository) {
    state = AsyncData<RoleSession?>(session);
  }

  @override
  Future<void> restoreSession() async {}
}

String _jwt(String subject) {
  String part(Object value) => base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part({'sub': subject})}.';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});

  late bool revoked;
  late AuthRepository repository;
  late ApiClient apiClient;
  late RoleSession session;
  late int profileFetches;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    revoked = false;
    profileFetches = 0;
    session = RoleSession(
      accessToken: _jwt('42'),
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      profile: const StaffProfile(
        name: 'Rijo',
        username: 'rijo',
        email: 'rijo@example.com',
        role: StaffRole.staff,
        status: 'active',
        mustChangePassword: false,
        restaurantName: 'Nadha Cafe',
        restaurantSlug: 'nadha-cafe',
      ),
    );
    apiClient = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (revoked) {
            return const ApiResponse(statusCode: 401, body: {'detail': 'Staff session has been revoked'});
          }
          if (request.uri.path.endsWith('/auth/staff/me')) {
            profileFetches += 1;
            return const ApiResponse(statusCode: 200, body: {
              'name': 'Rijo', 'username': 'rijo', 'email': 'rijo@example.com',
              'role': 'staff', 'status': 'active', 'must_change_password': false,
              'restaurant_name': 'Nadha Cafe', 'restaurant_slug': 'nadha-cafe',
            });
          }
          if (request.uri.path.endsWith('/staff/tables')) {
            return const ApiResponse(statusCode: 200, body: {'items': []});
          }
          return const ApiResponse(statusCode: 200, body: {'success': true});
        },
      );
    repository = AuthRepository(
      apiClient: apiClient,
      tokenStorage: MemoryTokenStorage(),
    );
  });

  Future<ProviderContainer> pumpGate(WidgetTester tester) async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(apiClient),
        authRepositoryProvider.overrideWithValue(repository),
        authProvider.overrideWith((ref) => _AuthMock(session, repository)),
      ],
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: StaffAccessGate(
            child: Scaffold(
              body: Text('Tables screen'),
              bottomNavigationBar: NavigationBar(destinations: [
                NavigationDestination(icon: Icon(Icons.table_restaurant), label: 'Tables'),
                NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
              ]),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  RealtimeEvent event(String type, {String? resourceId, Map<String, Object?> state = const {}}) => RealtimeEvent(
    id: '$type-${DateTime.now().microsecondsSinceEpoch}', type: type,
    timestamp: DateTime(2026, 7, 21, 23, 5), resourceId: resourceId, state: state,
  );

  testWidgets('individual and global lock replace the shell and hide navigation', (tester) async {
    final container = await pumpGate(tester);
    container.read(staffAccessProvider.notifier).handleEvent(event('staff.locked', resourceId: '42', state: {
      'staff_id': 42, 'locked_by': 'Kailasanadh', 'reason': 'Shift ended',
    }));
    await tester.pump();
    expect(find.text('Staff operations are locked'), findsOneWidget);
    expect(find.text('Reason:'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Tables screen'), findsNothing);

    container.read(staffAccessProvider.notifier).handleEvent(event('staff.all_locked', state: {'locked_by': 'Owner'}));
    await tester.pump();
    expect(find.text('Restaurant Staff operations are locked'), findsOneWidget);
    container.dispose();
  });

  testWidgets('closed restaurant has dedicated copy and back cannot reveal Staff UI', (tester) async {
    final container = await pumpGate(tester);
    container.read(staffAccessProvider.notifier).handleEvent(event('restaurant.status_changed', state: {'status': 'closed'}));
    await tester.pump();
    expect(find.text('Restaurant operations are closed'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.text('Restaurant operations are closed'), findsOneWidget);
    expect(find.text('Tables screen'), findsNothing);
    container.dispose();
  });

  testWidgets('unlock waits for refresh then restores Tables with a toast', (tester) async {
    final container = await pumpGate(tester);
    final notifier = container.read(staffAccessProvider.notifier);
    notifier.handleEvent(event('staff.all_locked'));
    await tester.pump();
    notifier.handleEvent(event('staff.all_unlocked'));
    await tester.pumpAndSettle();
    expect(find.text('Tables screen'), findsOneWidget);
    expect(find.text('Staff operations restored'), findsOneWidget);
    container.dispose();
  });

  testWidgets('revoked session refresh routes to Login instead of lock screen', (tester) async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(apiClient),
        authRepositoryProvider.overrideWithValue(repository),
        authProvider.overrideWith((ref) => _AuthMock(session, repository)),
      ],
    );
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const OmluNativeApp()));
    await tester.pumpAndSettle();
    container.read(staffAccessProvider.notifier).handleEvent(event('staff.all_locked'));
    await tester.pump();
    revoked = true;
    await container.read(staffAccessProvider.notifier).refreshAuthoritative();
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.textContaining('403'), findsNothing);
    container.dispose();
  });

  testWidgets('resume and reconnect revalidate while keeping the lock screen', (tester) async {
    final container = await pumpGate(tester);
    final notifier = container.read(staffAccessProvider.notifier);
    notifier.handleEvent(event('staff.all_locked'));
    await tester.pump();
    final before = profileFetches;
    notifier.didChangeAppLifecycleState(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(profileFetches, greaterThan(before));
    expect(find.text('Restaurant Staff operations are locked'), findsOneWidget);

    final afterResume = profileFetches;
    notifier.handleConnectionState(
      RealtimeConnectionState.reconnecting,
      RealtimeConnectionState.connected,
    );
    await tester.pumpAndSettle();
    expect(profileFetches, greaterThan(afterResume));
    expect(find.text('Restaurant Staff operations are locked'), findsOneWidget);
    container.dispose();
  });
}
