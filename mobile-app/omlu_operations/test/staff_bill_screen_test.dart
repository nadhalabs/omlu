import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/core/printing/printer_adapter.dart';
import 'package:omlu_operations/core/printing/printer_service.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/realtime_connection_provider.dart';
import 'package:omlu_operations/features/printing/printer_settings_screen.dart';
import 'package:omlu_operations/features/staff/staff_bill_screen.dart';

class _IssuePrintAdapter implements PrinterAdapter {
  _IssuePrintAdapter({required this.failFirst});
  final bool failFirst;
  int calls = 0;
  @override
  String get name => 'test tcp';
  @override
  Future<void> printBytes(List<int> bytes) async {
    calls++;
    if (failFirst && calls == 1) {
      throw const PrinterException('Printer is not connected.');
    }
  }
}

void main() {
  testWidgets('print failure keeps issued bill and retry never reissues', (
    tester,
  ) async {
    var issued = false;
    var issueCalls = 0;
    var receiptCalls = 0;
    final adapter = _IssuePrintAdapter(failFirst: true);
    final printer = PrinterService(
      storage: MemoryKeyValueStorage(),
      adapterFactory: (_) => adapter,
    );
    await printer.saveConfig(
      const PrinterConfig(enabled: true, tcpIpAddress: 'printer.local'),
    );
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/staff/bills/BILL-12/issue') {
            issueCalls++;
            issued = true;
            return const ApiResponse(
              statusCode: 200,
              body: {
                'bill_number': 'BILL-12',
                'status': 'issued',
                'total_amount': '105.00',
              },
            );
          }
          if (request.uri.path.endsWith('/receipt-payload')) {
            receiptCalls++;
            return const ApiResponse(
              statusCode: 200,
              body: {
                'bill_number': 'BILL-12',
                'receipt_title': 'TAX INVOICE',
                'restaurant_name': 'OMLU',
                'created_at': '2026-08-05T10:00:00Z',
                'items': <Object?>[],
                'subtotal': '100.00',
                'discount_amount': '0.00',
                'taxable_amount': '100.00',
                'cgst_amount': '2.50',
                'sgst_amount': '2.50',
                'igst_amount': '0.00',
                'tax_amount': '5.00',
                'grand_total': '105.00',
                'currency': 'INR',
                'payment_status': 'UNPAID',
                'is_official_invoice': true,
              },
            );
          }
          if (request.uri.path == '/staff/tables/12') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'table': {'id': 12, 'table_number': '6', 'state': 'occupied'},
                'session': {
                  'id': 100,
                  'session_token': 'session-100',
                  'status': 'payment_requested',
                  'orders': <Object?>[],
                  'bill': {
                    'bill_number': 'BILL-12',
                    'status': issued ? 'issued' : 'draft',
                    'subtotal': '100.00',
                    'tax_amount': '5.00',
                    'discount_amount': '0.00',
                    'total_amount': '105.00',
                  },
                },
                'activity': <Object?>[],
              },
            );
          }
          return const ApiResponse(
            statusCode: 200,
            body: {'items': <Object?>[]},
          );
        },
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          operationsApiProvider.overrideWithValue(api),
          printerServiceProvider.overrideWithValue(printer),
        ],
        child: const MaterialApp(home: StaffBillScreen(tableId: 12)),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Issue & Print Bill'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text('Issue & Print Bill'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Issue & Print Bill'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(issueCalls, 1);
    expect(receiptCalls, 1);
    expect(adapter.calls, 1);
    expect(find.text('Bill issued, but printing failed.'), findsOneWidget);
    expect(find.text('Retry Print'), findsOneWidget);
    expect(find.text('Continue Without Printing'), findsOneWidget);
    await tester.tap(find.text('Retry Print'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(issueCalls, 1);
    expect(receiptCalls, 2);
    expect(adapter.calls, 2);
    expect(find.text('Reprint Bill'), findsOneWidget);
    expect(find.text('Add Item'), findsNothing);
    expect(find.text('Add Served Item'), findsNothing);
  });

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

  testWidgets('draft bill offers add item and issue but no payment action', (
    tester,
  ) async {
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (_) async => const ApiResponse(
          statusCode: 200,
          body: {
            'table': {'id': 12, 'table_number': '6', 'state': 'occupied'},
            'session': {
              'id': 100,
              'session_token': 'session-100',
              'status': 'payment_requested',
              'orders': <Object?>[],
              'bill': {
                'bill_number': 'BILL-12',
                'status': 'draft',
                'subtotal': '100.00',
                'tax_amount': '5.00',
                'discount_amount': '0.00',
                'total_amount': '105.00',
              },
            },
            'activity': <Object?>[],
          },
        ),
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [operationsApiProvider.overrideWithValue(api)],
        child: const MaterialApp(home: StaffBillScreen(tableId: 12)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bill requested · Staff reviewing'), findsOneWidget);
    expect(find.text('Add Item'), findsOneWidget);
    expect(find.text('Issue Bill'), findsOneWidget);
    expect(find.textContaining('Record full payment'), findsNothing);
    expect(find.text('Send bill to counter'), findsNothing);
  });

  testWidgets('GST bill renders invoice identity and canonical tax split', (
    tester,
  ) async {
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (_) async => const ApiResponse(
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
              'orders': <Object?>[],
              'bill': {
                'bill_number': 'BILL-12',
                'invoice_number': 'MM/2026-27/000001',
                'invoice_date': '2026-07-20T12:00:00Z',
                'status': 'issued',
                'gst_enabled': true,
                'gstin': '32ABCDE1234F1Z5',
                'legal_business_name': 'Malabar Meals Private Limited',
                'registered_billing_address': 'MG Road, Kochi',
                'subtotal': '100.00',
                'discount_amount': '0.00',
                'taxable_amount': '100.00',
                'gst_rate': '5.00',
                'cgst_amount': '2.50',
                'sgst_amount': '2.50',
                'igst_amount': '0.00',
                'tax_amount': '5.00',
                'total_amount': '105.00',
              },
            },
            'activity': <Object?>[],
          },
        ),
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [operationsApiProvider.overrideWithValue(api)],
        child: const MaterialApp(home: StaffBillScreen(tableId: 12)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Malabar Meals Private Limited'), findsOneWidget);
    expect(find.textContaining('GSTIN: 32ABCDE1234F1Z5'), findsOneWidget);
    expect(find.textContaining('MM/2026-27/000001'), findsOneWidget);
    expect(find.text('Taxable subtotal'), findsOneWidget);
    expect(find.text('CGST (2.50%)'), findsOneWidget);
    expect(find.text('SGST (2.50%)'), findsOneWidget);
    expect(find.textContaining('IGST'), findsNothing);
  });
}
