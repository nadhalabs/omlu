import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/printing/printer_adapter.dart';
import 'package:omlu_operations/core/printing/printer_service.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/payments/pending_bill_review_screen.dart';
import 'package:omlu_operations/features/printing/printer_settings_screen.dart';

class BlockingAdapter implements PrinterAdapter {
  int calls = 0;
  final release = Completer<void>();
  @override
  String get name => 'blocking';
  @override
  Future<void> printBytes(List<int> bytes) async {
    calls++;
    await release.future;
  }
}

Map<String, Object?> billJson(String status) => {
  'bill_number': 'BILL-PRINT',
  'restaurant_name': 'OMLU Cafe',
  'table_number': '2',
  'status': status,
  'subtotal': '100.00',
  'tax_amount': '0.00',
  'discount_amount': '0.00',
  'total_amount': '100.00',
  'currency': 'INR',
  'orders': <Object?>[],
};

Map<String, Object?> receiptJson(String status) => {
  'bill_number': 'BILL-PRINT',
  'receipt_title': status == 'paid' ? 'PAYMENT RECEIPT' : 'TAX INVOICE',
  'status': status,
  'restaurant_name': 'OMLU Cafe',
  'legal_business_name': 'OMLU Cafe',
  'address': '',
  'table_number': '2',
  'staff_name': 'Staff',
  'created_at': '2026-08-05T10:00:00Z',
  'items': <Object?>[],
  'subtotal': '100.00',
  'discount_amount': '0.00',
  'taxable_amount': '100.00',
  'cgst_amount': '0.00',
  'sgst_amount': '0.00',
  'igst_amount': '0.00',
  'tax_amount': '0.00',
  'grand_total': '100.00',
  'currency': 'INR',
  'gst_enabled': false,
  'payment_status': status == 'paid' ? 'PAID' : 'UNPAID',
  'is_official_invoice': true,
};

Future<void> pumpBill(
  WidgetTester tester,
  String status, {
  PrinterService? printer,
}) async {
  final api = OperationsApi(
    ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (request) async {
        if (request.uri.path.endsWith('/receipt-payload')) {
          return ApiResponse(statusCode: 200, body: receiptJson(status));
        }
        return ApiResponse(statusCode: 200, body: billJson(status));
      },
    ),
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        operationsApiProvider.overrideWithValue(api),
        if (printer != null) printerServiceProvider.overrideWithValue(printer),
      ],
      child: const MaterialApp(
        home: PendingBillReviewScreen(billNumber: 'BILL-PRINT'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('draft hides print while issued and paid use correct labels', (
    tester,
  ) async {
    await pumpBill(tester, 'draft');
    expect(find.text('Print Bill'), findsNothing);
    expect(find.text('Print Receipt'), findsNothing);

    await pumpBill(tester, 'issued');
    await tester.scrollUntilVisible(
      find.text('Print Bill'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Print Bill'), findsOneWidget);

    await pumpBill(tester, 'paid');
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text('Print Receipt'), findsOneWidget);
  });

  testWidgets(
    'print button prevents double submission and allows later reprint',
    (tester) async {
      final adapter = BlockingAdapter();
      final printer = PrinterService(
        storage: MemoryKeyValueStorage(),
        adapterFactory: (_) => adapter,
      );
      await printer.saveConfig(
        const PrinterConfig(enabled: true, tcpIpAddress: 'printer.local'),
      );
      await pumpBill(tester, 'issued', printer: printer);
      await tester.scrollUntilVisible(
        find.text('Print Bill'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      final printButtonCenter = tester.getCenter(find.text('Print Bill'));
      await tester.tapAt(printButtonCenter);
      await tester.pump();
      await tester.tapAt(printButtonCenter);
      await tester.pump();
      expect(adapter.calls, 1);
      adapter.release.complete();
      await tester.pumpAndSettle();
    },
  );
}
