import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/realtime_connection_provider.dart';
import 'package:omlu_operations/features/staff/staff_bill_screen.dart';

void main() {
  testWidgets(
    'staff renders complete bill and sends it to counter without payment controls',
    (tester) async {
      var sentToCounter = false;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'staff-token',
          transport: (request) async {
            if (request.uri.path == '/staff/tables/12') {
              return ApiResponse(
                statusCode: 200,
                body: <String, Object?>{
                  'table': {
                    'id': 12,
                    'table_number': '6',
                    'state': 'occupied',
                    'has_open_session': true,
                  },
                  'session': {
                    'id': 100,
                    'session_token': 'session-100',
                    'status': sentToCounter
                        ? 'payment_pending'
                        : 'payment_requested',
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
                      'status': sentToCounter ? 'payment_pending' : 'issued',
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
            if (request.uri.path == '/staff/bills/BILL-12/send-to-counter') {
              sentToCounter = true;
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'bill_number': 'BILL-12',
                  'status': 'payment_pending',
                  'subtotal': '520.00',
                  'tax_amount': '26.00',
                  'discount_amount': '0.00',
                  'total_amount': '546.00',
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
      expect(find.text('Send bill to counter'), findsOneWidget);
      expect(find.textContaining('Record full payment'), findsNothing);
      expect(find.text('Cash'), findsNothing);
      expect(find.text('UPI'), findsNothing);
      expect(find.textContaining('Card'), findsNothing);

      await tester.drag(find.byType(ListView).first, const Offset(0, -500));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send bill to counter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send bill to counter').last);
      await tester.pumpAndSettle();

      expect(sentToCounter, isTrue);
      expect(find.text('Waiting for payment'), findsOneWidget);
      expect(find.text('Cash'), findsNothing);
      expect(find.text('UPI'), findsNothing);
    },
  );

  testWidgets('staff sees realtime payment confirmation without payment data', (
    tester,
  ) async {
    final events = StreamController<RealtimeEvent>();
    addTearDown(events.close);
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'staff-token',
        transport: (request) async => const ApiResponse(
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
              'status': 'payment_pending',
              'opened_at': '2026-07-20T12:00:00Z',
              'orders': <Object?>[],
              'bill': {
                'bill_number': 'BILL-12',
                'status': 'payment_pending',
                'subtotal': '567.00',
                'tax_amount': '0.00',
                'discount_amount': '0.00',
                'total_amount': '567.00',
              },
            },
            'activity': <Object?>[],
          },
        ),
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          operationsApiProvider.overrideWithValue(api),
          realtimeEventStreamProvider.overrideWith((ref) => events.stream),
        ],
        child: const MaterialApp(home: StaffBillScreen(tableId: 12)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Waiting for payment'), findsOneWidget);

    events.add(
      RealtimeEvent(
        id: 'payment-event-1',
        type: 'bill.payment_recorded',
        timestamp: DateTime.now(),
        state: const {'bill_number': 'BILL-12', 'status': 'paid'},
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Payment confirmed'), findsOneWidget);
    expect(find.textContaining('Cash'), findsNothing);
    expect(find.textContaining('UPI'), findsNothing);
  });
}
