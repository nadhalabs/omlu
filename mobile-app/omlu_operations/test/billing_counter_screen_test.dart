import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/payments/billing_counter_screen.dart';

void main() {
  testWidgets('owner Billing Counter classifies requested awaiting and paid queues', (tester) async {
    final api = OperationsApi(ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (request) async => const ApiResponse(statusCode: 200, body: {
        'requested': [
          {'bill_id': 1, 'bill_number': 'DRAFT-1', 'table_number': '1', 'item_count': 2, 'total_amount': '105.00'},
        ],
        'awaiting_payment': [
          {'bill_id': 2, 'bill_number': 'ISSUED-1', 'invoice_number': 'INV-1', 'table_number': '2', 'total_amount': '210.00'},
        ],
        'paid_recently': [
          {'bill_id': 3, 'bill_number': 'PAID-1', 'table_number': '3', 'payment_method': 'counter_upi', 'paid_at': '2026-08-05T10:00:00Z', 'total_amount': '315.00'},
        ],
      }),
    ));
    await tester.pumpWidget(ProviderScope(
      overrides: [operationsApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: BillingCounterScreen(actorRole: StaffRole.owner)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Billing Counter'), findsOneWidget);
    expect(find.text('Requested (1)'), findsOneWidget);
    expect(find.text('Awaiting Payment (1)'), findsOneWidget);
    expect(find.text('Paid (1)'), findsOneWidget);
    expect(find.text('Review & Issue'), findsOneWidget);

    await tester.tap(find.text('Awaiting Payment (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Review & Collect Payment'), findsOneWidget);
    expect(find.textContaining('Add Item'), findsNothing);

    await tester.tap(find.text('Paid (1)'));
    await tester.pumpAndSettle();
    expect(find.text('View & Print Receipt'), findsOneWidget);
  });
}
