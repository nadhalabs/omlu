import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/payments/pending_bill_review_screen.dart';

void main() {
  group('BillDetail Parsing', () {
    test('parses complete GST bill JSON cleanly', () {
      final json = <String, Object?>{
        'bill_number': 'BILL-900',
        'restaurant_name': 'Royal Spice',
        'table_number': '12',
        'status': 'payment_pending',
        'subtotal': '500.00',
        'discount_amount': '50.00',
        'tax_amount': '22.50',
        'total_amount': '472.50',
        'currency': 'INR',
        'gst_enabled': true,
        'taxable_amount': '450.00',
        'gst_rate': '5.00',
        'cgst_amount': '11.25',
        'sgst_amount': '11.25',
        'igst_amount': '0.00',
        'gstin': '33AAAAA0000A1Z5',
        'legal_business_name': 'Royal Spice Foods Private Limited',
        'invoice_number': 'INV-2026-900',
        'session_status': 'detached_awaiting_payment',
        'orders': [
          {
            'order_number': 'ORD-1',
            'status': 'served',
            'subtotal': '500.00',
            'customer_note': 'Make it hot',
            'items': [
              {
                'item_name': 'Chicken Tikka',
                'quantity': 2,
                'unit_price': '250.00',
                'line_total': '500.00',
                'item_note': 'Extra crisp',
                'selected_options': [
                  {'kitchen_display_name': 'Without Rice', 'price_adjustment': '0.00'},
                ],
              },
            ],
          },
        ],
      };

      final bill = BillDetail.fromJson(json);
      expect(bill.billNumber, 'BILL-900');
      expect(bill.tableNumber, '12');
      expect(bill.subtotal, 500.00);
      expect(bill.discountAmount, 50.00);
      expect(bill.taxableAmount, 450.00);
      expect(bill.cgstAmount, 11.25);
      expect(bill.sgstAmount, 11.25);
      expect(bill.totalAmount, 472.50);
      expect(bill.gstEnabled, isTrue);
      expect(bill.gstin, '33AAAAA0000A1Z5');
      expect(bill.orders.length, 1);
      expect(bill.orders.first.items.first.itemName, 'Chicken Tikka');
      expect(bill.orders.first.items.first.selectedOptions.first.displayName, 'Without Rice');
      expect(bill.orders.first.items.first.itemNote, 'Extra crisp');
      expect(bill.orders.first.customerNote, 'Make it hot');
    });

    test('handles missing GST and null fields gracefully without error or null string display', () {
      final json = <String, Object?>{
        'bill_number': 'BILL-101',
        'restaurant_name': 'Cafe Quick',
        'table_number': '3',
        'status': 'issued',
        'subtotal': '120.00',
        'tax_amount': '0.00',
        'discount_amount': '0.00',
        'total_amount': '120.00',
        'currency': 'INR',
        'gst_enabled': false,
        'orders': [],
      };

      final bill = BillDetail.fromJson(json);
      expect(bill.billNumber, 'BILL-101');
      expect(bill.gstEnabled, isFalse);
      expect(bill.taxableAmount, isNull);
      expect(bill.cgstAmount, isNull);
      expect(bill.orders, isEmpty);
    });
  });

  group('PendingBillReviewScreen UI', () {
    testWidgets('renders header, item lines, GST split, and confirm payment buttons for owner/admin', (
      tester,
    ) async {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async {
            if (request.uri.path == '/staff/bills/BILL-777') {
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'bill_number': 'BILL-777',
                  'restaurant_name': 'South Diner',
                  'table_number': '8',
                  'status': 'payment_pending',
                  'subtotal': '400.00',
                  'discount_amount': '0.00',
                  'tax_amount': '20.00',
                  'total_amount': '420.00',
                  'currency': 'INR',
                  'gst_enabled': true,
                  'taxable_amount': '400.00',
                  'cgst_amount': '10.00',
                  'sgst_amount': '10.00',
                  'session_status': 'detached_awaiting_payment',
                  'orders': [
                    {
                      'order_number': 'O-10',
                      'status': 'served',
                      'subtotal': '400.00',
                      'items': [
                        {
                          'item_name': 'Mutton Biriyani',
                          'quantity': 1,
                          'unit_price': '400.00',
                          'line_total': '400.00',
                          'selected_options': [
                            {'kitchen_display_name': 'Spicy', 'price_adjustment': '0.00'},
                          ],
                        },
                      ],
                    },
                  ],
                },
              );
            }
            return const ApiResponse(statusCode: 404, body: {});
          },
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [operationsApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: PendingBillReviewScreen(billNumber: 'BILL-777'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Table 8'), findsOneWidget);
      expect(find.text('Bill #BILL-777'), findsOneWidget);
      expect(find.text('Mutton Biriyani'), findsOneWidget);
      expect(find.text('Options: Spicy'), findsOneWidget);
      expect(find.text('CGST'), findsOneWidget);
      expect(find.text('SGST'), findsOneWidget);

      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();

      expect(find.text('Total due: ₹420.00'), findsOneWidget);
      expect(find.text('Confirm Cash received'), findsOneWidget);
      expect(find.text('Confirm UPI received'), findsOneWidget);
    });

    testWidgets('Renders on 320px width without layout overflow', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(
            statusCode: 200,
            body: {
              'bill_number': 'BILL-320',
              'restaurant_name': 'Mini Cafe',
              'table_number': '1',
              'status': 'payment_pending',
              'subtotal': '100.00',
              'tax_amount': '5.00',
              'discount_amount': '0.00',
              'total_amount': '105.00',
              'currency': 'INR',
              'orders': [],
            },
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [operationsApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: PendingBillReviewScreen(billNumber: 'BILL-320'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Table 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
