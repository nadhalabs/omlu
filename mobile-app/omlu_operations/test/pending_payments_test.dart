import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/payments/pending_payments_tab.dart';

void main() {
  testWidgets('Owner or Admin confirms UPI from pending payments queue', (
    tester,
  ) async {
    var confirmed = false;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'admin-token',
        transport: (request) async {
          if (request.uri.path == '/staff/bills/pending-payments') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'items': confirmed
                    ? <Object?>[]
                    : <Object?>[
                        {
                          'bill_number': 'BILL-12',
                          'table_id': 12,
                          'table_number': '6',
                          'session_token': 'session-100',
                          'total_amount': '567.00',
                          'requested_at': '2026-07-20T12:30:00Z',
                          'sent_by_staff_name': 'Asha',
                          'status': 'payment_pending',
                        },
                      ],
              },
            );
          }
          if (request.uri.path ==
              '/staff/bills/BILL-12/confirm-counter-payment') {
            expect(request.body, {'method': 'counter_upi'});
            confirmed = true;
            return const ApiResponse(
              statusCode: 200,
              body: {'bill_number': 'BILL-12', 'status': 'paid'},
            );
          }
          return const ApiResponse(statusCode: 404, body: {});
        },
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [operationsApiProvider.overrideWithValue(api)],
        child: const MaterialApp(home: PendingPaymentsTab()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Table 6'), findsOneWidget);
    expect(find.text('₹567.00'), findsOneWidget);
    expect(find.text('Sent by Asha'), findsOneWidget);

    await tester.tap(find.text('Confirm UPI received'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Confirm ₹567.00 received by UPI for Table 6?'),
      findsOneWidget,
    );
    await tester.tap(find.text('Confirm UPI received').last);
    await tester.pumpAndSettle();

    expect(confirmed, isTrue);
    expect(find.text('No payments waiting'), findsOneWidget);
  });
}
