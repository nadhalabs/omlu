import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/features/kitchen/kitchen_screen.dart';
import 'package:omlu_operations/features/kitchen/kitchen_orders_provider.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';

class MockKitchenOrdersNotifier extends KitchenOrdersNotifier {
  // ignore: use_super_parameters
  MockKitchenOrdersNotifier(
    OperationsApi api,
    String slug,
    Ref ref,
    this.mockData,
  ) : super(api, slug, ref);

  final List<KitchenOrder> mockData;

  @override
  Future<void> fetchOrders({bool silent = false}) async {
    state = AsyncValue.data(mockData);
  }
}

class DummyAuthStateNotifier extends AuthStateNotifier {
  DummyAuthStateNotifier(super.repository) {
    state = AsyncValue.data(
      RoleSession(
        accessToken: 'token',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        profile: const StaffProfile(
          name: 'Chef',
          email: 'chef@example.com',
          role: StaffRole.kitchen,
          status: 'active',
          mustChangePassword: false,
          restaurantName: 'Omlu Demo',
          restaurantSlug: 'omlu-demo',
        ),
      ),
    );
  }
}

void main() {
  final mockOrders = [
    KitchenOrder(
      orderNumber: 'SO-101',
      publicToken: 'tok1',
      tableNumber: 'Table A1',
      status: 'accepted',
      subtotal: 200.0,
      createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
      items: const [KitchenOrderItem(name: 'Cola', quantity: 2)],
    ),
    KitchenOrder(
      orderNumber: 'SO-102',
      publicToken: 'tok2',
      tableNumber: 'Table B2',
      status: 'preparing',
      subtotal: 120.0,
      createdAt: DateTime.now().subtract(const Duration(minutes: 12)),
      items: const [KitchenOrderItem(name: 'Burger', quantity: 1)],
    ),
  ];

  late OperationsApi dummyApi;

  setUp(() {
    final client = ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (request) async => throw UnimplementedError(),
    );
    dummyApi = OperationsApi(client);
  });

  Widget buildKitchen({required Size size}) {
    return ProviderScope(
      overrides: [
        authProvider.overrideWith(
          (ref) => DummyAuthStateNotifier(
            AuthRepository(
              apiClient: ApiClient(
                baseUrl: Uri.parse('https://api.example'),
                transport: (_) async => throw UnimplementedError(),
              ),
              tokenStorage: MemoryTokenStorage(),
            ),
          ),
        ),
        kitchenOrdersProvider.overrideWith(
          (ref) =>
              MockKitchenOrdersNotifier(dummyApi, 'omlu-demo', ref, mockOrders),
        ),
      ],
      child: MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: const KitchenScreen(),
        ),
      ),
    );
  }

  testWidgets('Kitchen Board layout is responsive', (tester) async {
    // 1. Test Tablet layout (1024x768)
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;

    await tester.pumpWidget(buildKitchen(size: const Size(1024, 768)));
    await tester.pumpAndSettle();

    // Verify 3 columns: New, Preparing, Ready
    expect(find.text('New'), findsOneWidget);
    expect(find.text('Preparing'), findsOneWidget);
    expect(find.text('Ready'), findsOneWidget);

    // 2. Test Phone layout (375x667)
    tester.view.physicalSize = const Size(375, 667);
    await tester.pumpWidget(buildKitchen(size: const Size(375, 667)));
    await tester.pumpAndSettle();

    // In mobile stacked list, column titles are not displayed, it's just a simple list.
    expect(find.text('New'), findsNothing);
    expect(find.text('Preparing'), findsNothing);

    // Clean up physical size overrides
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}
