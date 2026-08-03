import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/payments/payment_code_lookup_sheet.dart';

void main() {
  group('Payment Code API Lookup', () {
    test('lookupPendingPaymentCode normalizes code and parses response', () async {
      late ApiRequest capturedRequest;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'staff-token',
          transport: (request) async {
            capturedRequest = request;
            return const ApiResponse(
              statusCode: 200,
              body: {
                'bill_number': 'BILL-88',
                'restaurant_name': 'Taste of India',
                'original_table': '4',
                'original_table_id': 4,
                'session_id': 100,
                'bill_status': 'payment_pending',
                'session_status': 'detached_awaiting_payment',
                'amount_due': '750.00',
                'currency': 'INR',
                'issued_at': '2026-08-03T10:00:00Z',
                'detached_at': '2026-08-03T10:05:00Z',
                'payment_code_expires_at': '2026-08-03T10:30:00Z',
                'waiting_seconds': 120,
                'order_summary': {
                  'order_count': 1,
                  'item_count': 2,
                  'items': ['2 × Paneer Butter Masala'],
                },
                'can_confirm_payment': true,
              },
            );
          },
        ),
      );

      final result = await api.lookupPendingPaymentCode(' abc-234 ');
      expect(capturedRequest.body, {'payment_code': 'ABC234'});
      expect(result.billNumber, 'BILL-88');
      expect(result.originalTable, '4');
      expect(result.amountDue, 750.00);
      expect(result.currency, 'INR');
      expect(result.canConfirmPayment, isTrue);
      expect(result.orderSummaryItems, ['2 × Paneer Butter Masala']);
    });

    test('lookupPendingPaymentCode throws ValidationException when code is invalid length', () {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(statusCode: 200, body: {}),
        ),
      );

      expect(
        () => api.lookupPendingPaymentCode('ABC23'),
        throwsA(isA<ValidationException>()),
      );
    });

    test('lookupPendingPaymentCode rejects codes containing ambiguous characters like A1B0S5', () {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(statusCode: 200, body: {}),
        ),
      );

      expect(
        () => api.lookupPendingPaymentCode('A1B0S5'),
        throwsA(
          isA<ValidationException>().having(
            (e) => e.message,
            'message',
            contains('Enter a valid 6-character payment code.'),
          ),
        ),
      );
    });

    test('lookupPendingPaymentCode maps 404 to friendly NotFoundException', () async {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(
            statusCode: 404,
            body: {'detail': 'Payment code was not found.'},
          ),
        ),
      );

      expect(
        () => api.lookupPendingPaymentCode('XYZ999'),
        throwsA(
          isA<NotFoundException>().having(
            (e) => e.message,
            'message',
            contains('We could not find an unpaid bill with this code'),
          ),
        ),
      );
    });

    test('lookupPendingPaymentCode maps 429 to friendly RateLimitException', () async {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(
            statusCode: 429,
            body: {'detail': 'Too many payment-code lookup attempts.'},
          ),
        ),
      );

      expect(
        () => api.lookupPendingPaymentCode('XYZ999'),
        throwsA(
          isA<RateLimitException>().having(
            (e) => e.message,
            'message',
            contains('Too many payment-code lookup attempts'),
          ),
        ),
      );
    });
  });

  group('PaymentCodeLookupSheet UI', () {
    testWidgets('Input restricts formatting, enables button at 6 chars, and clears text', (
      tester,
    ) async {
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(
            statusCode: 200,
            body: {
              'bill_number': 'BILL-88',
              'restaurant_name': 'Resto',
              'original_table': '2',
              'original_table_id': 2,
              'session_id': 1,
              'bill_status': 'payment_pending',
              'session_status': 'detached_awaiting_payment',
              'amount_due': '300.00',
              'currency': 'INR',
            },
          ),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [operationsApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: Scaffold(
              body: PaymentCodeLookupSheet(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Enter payment code'), findsOneWidget);
      expect(find.text('0 / 6'), findsOneWidget);

      // Enter 4 characters
      await tester.enterText(find.byType(TextField), 'ab23');
      await tester.pump();
      expect(find.text('4 / 6'), findsOneWidget);

      // Enter 6 valid characters (with lowercase and spaces)
      await tester.enterText(find.byType(TextField), 'ab 23 cd');
      await tester.pump();
      expect(find.text('6 / 6'), findsOneWidget);

      // Tap clear button
      expect(find.byIcon(Icons.cancel_rounded), findsOneWidget);
      await tester.tap(find.byIcon(Icons.cancel_rounded));
      await tester.pump();
      expect(find.text('0 / 6'), findsOneWidget);
    });

    testWidgets('Renders on 320px width without overflow', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async => const ApiResponse(statusCode: 200, body: {}),
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [operationsApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: Scaffold(
              body: PaymentCodeLookupSheet(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Enter payment code'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
