import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/features/staff/menu_provider.dart';
import 'package:omlu_operations/features/staff/cart_provider.dart';
import 'package:omlu_operations/features/staff/new_order_screen.dart';
import 'package:omlu_operations/features/staff/staff_shell.dart';
import 'package:omlu_operations/features/auth_provider.dart';

void main() {
  late OperationsApi dummyApi;
  late int apiRequestCount;
  late int orderRequestCount;
  late String mockState;
  late bool mockHasOpenSession;
  late int mockOrderCount;
  late List<String> mockAttention;
  late bool mockBillRequested;
  late String mockSessionStatus;
  late Map<String, Object?>? mockBillData;
  late List<Map<String, Object?>> mockRequestsList;

  setUp(() {
    apiRequestCount = 0;
    orderRequestCount = 0;
    mockState = 'available';
    mockHasOpenSession = false;
    mockOrderCount = 0;
    mockAttention = [];
    mockBillRequested = false;
    mockSessionStatus = 'open';
    mockBillData = null;
    mockRequestsList = [];

    final client = ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (request) async {
        final path = request.uri.path;

        if (path == '/staff/tables') {
          return ApiResponse(
            statusCode: 200,
            body: {
              'items': [
                {
                  'id': 12,
                  'table_number': '12',
                  'state': mockState,
                  'has_open_session': mockHasOpenSession,
                  'active_order_count': mockOrderCount,
                  'current_bill_amount': '120.00',
                  'attention': mockAttention,
                  'bill_requested': mockBillRequested,
                  'session_status': mockSessionStatus,
                },
              ],
            },
          );
        } else if (path == '/staff/tables/12') {
          return ApiResponse(
            statusCode: 200,
            body: {
              'table': {
                'id': 12,
                'table_number': '12',
                'state': mockState,
                'has_open_session': mockHasOpenSession,
                'active_order_count': mockOrderCount,
                'current_bill_amount': '120.00',
                'attention': mockAttention,
                'bill_requested': mockBillRequested,
                'session_status': mockSessionStatus,
              },
              'session': mockHasOpenSession
                  ? {
                      'id': 100,
                      'session_token': 'session-token-xyz',
                      'status': mockSessionStatus,
                      'orders': List.generate(
                        mockOrderCount,
                        (index) => {
                          'id': index,
                          'order_number': 'ORD-$index',
                          'status': 'served',
                          'subtotal': '120.00',
                          'source': 'staff_assisted',
                          'created_at': '2026-07-16T12:00:00Z',
                          'items': [],
                        },
                      ),
                      'bill': mockBillData,
                    }
                  : null,
              'requests': mockRequestsList,
              'menu_categories': [
                {
                  'id': 1,
                  'name_en': 'Test Drinks',
                  'items': [
                    {
                      'id': 101,
                      'name_en': 'Cola',
                      'price': '40.00',
                      'is_available': true,
                      'option_groups': [],
                    },
                  ],
                },
              ],
              'activity': [],
            },
          );
        } else if (path == '/staff/tables/12/bill-request') {
          apiRequestCount++;
          return const ApiResponse(
            statusCode: 201,
            body: {
              'id': 999,
              'table_id': 12,
              'request_type': 'bill',
              'status': 'pending',
              'created_at': '2026-07-16T12:30:00Z',
              'resolved_at': null,
              'resolved_by_staff_id': null,
            },
          );
        } else if (path == '/staff/tables/12/orders') {
          orderRequestCount++;
          mockHasOpenSession = true;
          mockOrderCount = 1;
          mockSessionStatus = 'open';
          mockState = 'occupied';
          return const ApiResponse(
            statusCode: 201,
            body: {
              'order_number': 'ORD-999',
              'public_token': 'order-token-999',
              'status': 'received',
              'subtotal': '40.00',
              'table_number': '12',
              'created_at': '2026-07-16T12:45:00Z',
              'items': [],
              'status_history': [],
            },
          );
        }

        return const ApiResponse(
          statusCode: 404,
          body: {'detail': 'Not found'},
        );
      },
    );
    dummyApi = OperationsApi(client);
  });

  Widget buildTestApp() {
    return ProviderScope(
      overrides: [operationsApiProvider.overrideWithValue(dummyApi)],
      child: const MaterialApp(home: StaffShell()),
    );
  }

  test('StaffTableSummary.fromListJson parses summary JSON', () {
    final json = {
      'id': 12,
      'table_number': '12',
      'state': 'occupied',
      'has_open_session': true,
      'session_token': 'tok',
      'session_status': 'open',
      'active_order_count': 3,
      'current_bill_amount': '150.50',
      'attention': ['bill', 'water'],
      'bill_requested': true,
    };
    final summary = StaffTableSummary.fromListJson(json);
    expect(summary.id, 12);
    expect(summary.tableNumber, '12');
    expect(summary.hasOpenSession, true);
    expect(summary.sessionStatus, 'open');
    expect(summary.activeOrderCount, 3);
    expect(summary.currentBillAmount, 150.5);
    expect(summary.hasActiveBillRequest, true);
    expect(summary.billId, isNull);
    expect(summary.billStatus, isNull);
  });

  test('StaffTableSummary.fromDetailJson parses detail JSON', () {
    final detail = {
      'table': {
        'id': 12,
        'table_number': '12',
        'state': 'occupied',
        'has_open_session': true,
      },
      'session': {
        'id': 100,
        'session_token': 'tok',
        'status': 'open',
        'orders': [{}, {}],
        'bill': {'id': 200, 'bill_number': 'BILL-99', 'status': 'issued'},
      },
      'requests': [
        {'request_type': 'bill', 'status': 'pending'},
      ],
    };
    final summary = StaffTableSummary.fromDetailJson(detail);
    expect(summary.id, 12);
    expect(summary.tableNumber, '12');
    expect(summary.hasOpenSession, true);
    expect(summary.sessionStatus, 'open');
    expect(summary.activeOrderCount, 2);
    expect(summary.activeSessionId, 100);
    expect(summary.billId, 200);
    expect(summary.billStatus, 'issued');
    expect(summary.billNumber, 'BILL-99');
    expect(summary.hasActiveBillRequest, true);
  });

  testWidgets('Request Bill UI State Machine rendering validation', (
    tester,
  ) async {
    // 1. Empty table: no open session, no orders → show nothing
    mockHasOpenSession = false;
    mockOrderCount = 0;
    await tester.pumpWidget(buildTestApp());
    await tester.pumpAndSettle();

    // Go to Table 12
    await tester.tap(find.text('12'));
    await tester.pumpAndSettle();

    expect(find.text('Session & billing'), findsNothing);
    expect(find.text('View Session & Bill'), findsNothing);

    // Back to tables
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();

    // 2. Active session + orders → shows contextual session and bill entry
    mockHasOpenSession = true;
    mockOrderCount = 1;
    mockSessionStatus = 'open';
    await tester.tap(find.text('12'));
    await tester.pumpAndSettle();
    refresher(tester);
    await tester.pumpAndSettle();

    expect(find.text('Session & billing'), findsOneWidget);
    expect(find.text('View Session & Bill'), findsOneWidget);
    expect(apiRequestCount, 0);

    // 3. Unresolved customer bill request → Staff can handle it directly
    mockBillRequested = true;
    mockAttention = ['bill'];
    mockRequestsList = [
      {'request_type': 'bill', 'status': 'pending'},
    ];
    // Force reload page
    refresher(tester);
    await tester.pumpAndSettle();
    expect(find.text('Bill requested'), findsOneWidget);
    expect(find.text('Review & Generate Bill'), findsOneWidget);
    expect(find.text('Waiting for owner/admin'), findsNothing);

    // 4. Generated bill exists → Bill Issued
    mockBillData = {'id': 200, 'bill_number': 'BILL-12', 'status': 'issued'};
    mockBillRequested = false;
    mockAttention = [];
    mockRequestsList = [];
    refresher(tester);
    await tester.pumpAndSettle();
    expect(find.text('Bill Issued'), findsOneWidget);
    expect(find.text('Bill: BILL-12'), findsOneWidget);
    expect(find.text('Open Bill'), findsOneWidget);
    expect(find.text('Waiting for owner/admin'), findsNothing);

    // 5. Session closed → hides actions
    mockSessionStatus = 'closed';
    refresher(tester);
    await tester.pumpAndSettle();
    expect(find.text('Bill Issued'), findsNothing);
    expect(find.text('Open Bill'), findsNothing);

    // 6. Paid bill → hides actions
    mockSessionStatus = 'open';
    mockBillData = {'id': 200, 'bill_number': 'BILL-12', 'status': 'paid'};
    refresher(tester);
    await tester.pumpAndSettle();
    expect(find.text('Bill Issued'), findsNothing);
    expect(find.text('Open Bill'), findsNothing);

    // 7. Verify staff never sees payment controls (cash, UPI, card confirm, close session)
    expect(
      find.textContaining(RegExp('cash', caseSensitive: false)),
      findsNothing,
    );
    expect(
      find.textContaining(RegExp('upi', caseSensitive: false)),
      findsNothing,
    );
    expect(
      find.textContaining(RegExp('card', caseSensitive: false)),
      findsNothing,
    );
    expect(
      find.textContaining(RegExp('mark paid', caseSensitive: false)),
      findsNothing,
    );
    expect(
      find.textContaining(RegExp('close session', caseSensitive: false)),
      findsNothing,
    );
  });

  testWidgets(
    'Cart submission clears cart items, keeps table selected, and reveals session billing',
    (tester) async {
      mockHasOpenSession = false;
      mockOrderCount = 0;
      mockState = 'available';

      await tester.pumpWidget(buildTestApp());
      await tester.pumpAndSettle();

      // Tap Table 12 to open ordering
      await tester.tap(find.text('12'));
      await tester.pumpAndSettle();

      // No billing card should be visible yet
      expect(find.text('View Session & Bill'), findsNothing);

      // Add item to cart
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();

      // Tap View Order to open CartScreen
      await tester.tap(find.text('View Order'));
      await tester.pumpAndSettle();

      // Send Order
      await tester.tap(find.text('Send Order'));
      await tester.pumpAndSettle();

      // CartScreen pops, returning to NewOrderScreen for table 12 (remains selected)
      expect(find.textContaining('Staff · 12'), findsOneWidget);

      // Cart cleared
      expect(find.text('1 Items selected'), findsNothing);

      // Session billing is immediately visible without leaving or restarting
      expect(find.text('View Session & Bill'), findsOneWidget);
      expect(orderRequestCount, 1);
    },
  );
}

void refresher(WidgetTester tester) {
  final BuildContext context = tester.element(find.byType(NewOrderScreen));
  final container = ProviderScope.containerOf(context);
  final tableId = container.read(selectedTableIdProvider);
  if (tableId != null) {
    container.invalidate(tableDetailProvider(tableId));
  }
}
