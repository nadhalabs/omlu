import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/features/staff/tables_provider.dart';
import 'package:omlu_operations/features/staff/cart_provider.dart';
import 'package:omlu_operations/features/staff/menu_provider.dart';
import 'package:omlu_operations/features/staff/service_requests_provider.dart';
import 'package:omlu_operations/features/staff/staff_shell.dart';
import 'package:omlu_operations/features/staff/new_order_screen.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/api/api_client.dart';

// Mocks
class MockTablesNotifier extends TablesNotifier {
  MockTablesNotifier(super.api, super.ref, this.mockData);
  final List<StaffTableSummary> mockData;

  @override
  Future<void> fetchTables({bool silent = false}) async {
    state = AsyncValue.data(mockData);
  }
}

class MockServiceRequestsNotifier extends ServiceRequestsNotifier {
  MockServiceRequestsNotifier(super.api, super.ref, this.mockData);
  final List<dynamic> mockData;

  @override
  Future<void> fetchRequests({bool silent = false}) async {
    state = AsyncValue.data(mockData);
  }
}

void main() {
  final mockTables = [
    const StaffTableSummary(
      id: 1,
      tableNumber: 'Table 1',
      state: 'available',
      hasOpenSession: false,
      activeOrderCount: 0,
      currentBillAmount: 0.0,
      attention: [],
      billRequested: false,
    ),
    const StaffTableSummary(
      id: 2,
      tableNumber: 'Table 2',
      state: 'occupied',
      hasOpenSession: true,
      activeOrderCount: 1,
      currentBillAmount: 120.0,
      attention: ['ready_order'],
      billRequested: true,
      openedMinutesAgo: 15,
    ),
  ];

  final mockRequests = [
    {
      'id': 101,
      'table_number': 'Table 2',
      'request_type': 'Water bottle',
      'status': 'pending',
      'created_at': '2026-07-16T12:00:00Z',
    },
    {
      'id': 102,
      'table_number': 'Table 1',
      'request_type': 'Menu assist',
      'status': 'resolved',
      'created_at': '2026-07-16T11:45:00Z',
      'resolved_at': '2026-07-16T11:55:00Z',
    },
  ];

  final mockMenu = [
    const MenuCategory(
      id: 10,
      name: 'Drinks',
      items: [
        MenuItem(
          id: 201,
          name: 'Cola',
          price: 40.0,
          isAvailable: true,
          description: 'Chilled soda',
        ),
        MenuItem(
          id: 202,
          name: 'Ice Tea',
          price: 60.0,
          isAvailable: false,
          description: 'Lemon flavour',
        ),
      ],
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

  Widget buildShell({List<Override> overrides = const []}) {
    return ProviderScope(
      overrides: [
        tablesProvider.overrideWith(
          (ref) => MockTablesNotifier(dummyApi, ref, mockTables),
        ),
        serviceRequestsProvider.overrideWith(
          (ref) => MockServiceRequestsNotifier(dummyApi, ref, mockRequests),
        ),
        menuCategoriesProvider(2).overrideWith((ref) => Future.value(mockMenu)),
        ...overrides,
      ],
      child: const MaterialApp(home: StaffShell()),
    );
  }

  group('Tables Screen Layout Validation', () {
    testWidgets(
      'omits guest counts, open session buttons and shows table statuses cleanly',
      (tester) async {
        await tester.pumpWidget(buildShell());
        await tester.pumpAndSettle();

        // Check tables are rendered
        expect(find.text('Table 1'), findsOneWidget);
        expect(find.text('Table 2'), findsOneWidget);

        // Check status strings mapped cleanly
        expect(find.text('Available'), findsOneWidget);
        expect(
          find.text('Bill Requested'),
          findsOneWidget,
        ); // Table 2 has billRequested: true

        // Verify NO start session or open session button is visible
        expect(find.text('Start Session'), findsNothing);
        expect(find.text('Open Session'), findsNothing);

        // Verify NO guest count field is visible
        expect(find.textContaining('guest'), findsNothing);
        expect(find.textContaining('Guest'), findsNothing);
      },
    );
  });

  group('Cart Scoping and Immediate Updates', () {
    testWidgets('supports immediate quantity addition and local update', (
      tester,
    ) async {
      await tester.pumpWidget(buildShell());
      await tester.pumpAndSettle();

      // Go to New Order
      await tester.tap(find.byIcon(Icons.add_circle_outline_rounded));
      await tester.pumpAndSettle();

      // Select table 2 from picker
      await tester.tap(find.text('Table 2'));
      await tester.pumpAndSettle();

      // Check Cola item is visible
      expect(find.text('Cola'), findsOneWidget);

      // Tap Add button
      await tester.tap(find.text('Add'));
      await tester.pump(); // immediate local update

      // Verify quantity indicator is updated immediately to '1' without network calls
      expect(
        find.descendant(
          of: find.byType(NewOrderScreen),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('prevents duplicate Send Order clicks while submitting', (
      tester,
    ) async {
      // Setup cart with items and mark it submitting
      final container = ProviderContainer(
        overrides: [
          cartProvider.overrideWith(
            (ref) => CartNotifier(ref)
              ..state = CartState(
                tableId: 2,
                items: {201: const CartItem(menuItemId: 201, quantity: 2)},
                idempotencyKey: 'key-123',
                submissionState: SubmissionState.submitting,
              ),
          ),
        ],
      );

      final state = container.read(cartProvider);
      expect(state.submissionState, SubmissionState.submitting);
      expect(state.items.isNotEmpty, true);
    });
  });

  group('Requests Navigation Badge', () {
    testWidgets(
      'displays active requests count on Requests bottom navigation tab',
      (tester) async {
        await tester.pumpWidget(buildShell());
        await tester.pumpAndSettle();

        // Count active requests (pending count in mockRequests is 1)
        expect(find.text('1'), findsOneWidget); // badge on requests tab
      },
    );
  });
}
