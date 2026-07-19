import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/staff/staff_bill_screen.dart';

void main() {
  testWidgets(
    'renders complete bill and records manual UPI only after backend confirmation',
    (tester) async {
      var paymentCalls = 0;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'staff-token',
          transport: (request) async {
            if (request.uri.path == '/staff/tables/12') {
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'table': {
                    'id': 12,
                    'table_number': '6',
                    'state': 'occupied',
                    'has_open_session': true,
                  },
                  'session': {
                    'id': 100,
                    'session_token': 'session-100',
                    'status': 'payment_requested',
                    'opened_at': '2026-07-20T12:00:00Z',
                    'orders': [
                      {
                        'order_number': 'ORD-1042',
                        'status': 'served',
                        'items': [
                          {
                            'item_name': 'Chicken Biriyani',
                            'quantity': 2,
                            'unit_price': '220.00',
                            'total_price': '440.00',
                          },
                          {
                            'item_name': 'Lime Juice',
                            'quantity': 1,
                            'unit_price': '80.00',
                            'total_price': '80.00',
                          },
                        ],
                      },
                    ],
                    'bill': {
                      'bill_number': 'BILL-12',
                      'status': 'issued',
                      'subtotal': '520.00',
                      'tax_amount': '26.00',
                      'discount_amount': '0.00',
                      'total_amount': '546.00',
                      'currency': 'INR',
                    },
                  },
                  'activity': [
                    {
                      'label': 'Session opened',
                      'timestamp': '2026-07-20T12:00:00Z',
                    },
                  ],
                },
              );
            }
            if (request.uri.path ==
                '/staff/bills/BILL-12/confirm-counter-payment') {
              paymentCalls += 1;
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'bill_number': 'BILL-12',
                  'status': 'paid',
                  'subtotal': '520.00',
                  'tax_amount': '26.00',
                  'discount_amount': '0.00',
                  'total_amount': '546.00',
                  'payment_method': 'counter_upi',
                  'paid_at': '2026-07-20T12:30:00Z',
                },
              );
            }
            if (request.uri.path == '/staff/tables') {
              return const ApiResponse(statusCode: 200, body: {'items': []});
            }
            return const ApiResponse(
              statusCode: 404,
              body: {'detail': 'Not found'},
            );
          },
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [operationsApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: StaffBillScreen(tableId: 12)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Table 6'), findsOneWidget);
      expect(find.text('2 ×'), findsOneWidget);
      expect(find.text('Chicken Biriyani'), findsOneWidget);
      expect(find.text('Tax'), findsOneWidget);
      expect(find.text('Service charge'), findsOneWidget);
      expect(find.text('Balance'), findsOneWidget);
      expect(find.textContaining('Accept Full Payment'), findsOneWidget);
      expect(find.textContaining('Card'), findsNothing);
      expect(find.text('Payment recorded'), findsNothing);

      await tester.drag(find.byType(ListView).first, const Offset(0, -500));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Accept Full Payment'));
      await tester.pumpAndSettle();
      expect(find.text('Cash'), findsOneWidget);
      expect(find.text('UPI'), findsOneWidget);
      expect(find.textContaining('Card'), findsNothing);

      await tester.tap(find.text('UPI'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Confirm UPI'));
      await tester.pumpAndSettle();

      expect(paymentCalls, 1);
      expect(find.text('Payment recorded'), findsOneWidget);
      expect(find.textContaining('UPI at counter'), findsOneWidget);
    },
  );
}
