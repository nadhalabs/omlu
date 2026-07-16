import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/features/staff/menu_provider.dart';

void main() {
  group('Safe JSON parsing and helpers', () {
    test('readString normalizes values correctly', () {
      expect(readString(null), '');
      expect(readString('hello'), 'hello');
      expect(readString(123), '123');
      expect(readString(true), 'true');
    });

    test('readDouble parses numeric and string values correctly', () {
      expect(readDouble(180.0), 180.0);
      expect(readDouble('180.00'), 180.0);
      expect(readDouble(null), 0.0);
      expect(readDouble('invalid', fallback: 5.5), 5.5);
    });

    test('readInt parses numeric and string values correctly', () {
      expect(readInt(5), 5);
      expect(readInt('42'), 42);
      expect(readInt(null), 0);
      expect(readInt('abc', fallback: -1), -1);
    });

    test('readRequiredId throws FormatException if absent or invalid', () {
      expect(() => readRequiredId(null, 'test_id'), throwsFormatException);
      expect(
        () => readRequiredId('not_an_int', 'test_id'),
        throwsFormatException,
      );
      expect(readRequiredId(123, 'test_id'), 123);
      expect(readRequiredId('456', 'test_id'), 456);
    });

    test(
      'StaffTableSummary parses numeric and string currentBillAmount correctly',
      () {
        final jsonWithDouble = {
          'id': 1,
          'table_number': 'T1',
          'state': 'occupied',
          'has_open_session': true,
          'session_token': 'sess-123',
          'session_status': 'active',
          'active_order_count': 2,
          'current_bill_amount': 250.50,
          'opened_minutes_ago': 45,
          'attention': ['need_help'],
          'bill_requested': false,
        };

        final summaryWithDouble = StaffTableSummary.fromJson(jsonWithDouble);
        expect(summaryWithDouble.id, 1);
        expect(summaryWithDouble.currentBillAmount, 250.50);

        final jsonWithString = {
          'id': '2',
          'table_number': 'T2',
          'current_bill_amount': '125.75',
        };

        final summaryWithString = StaffTableSummary.fromJson(jsonWithString);
        expect(summaryWithString.id, 2);
        expect(summaryWithString.currentBillAmount, 125.75);
      },
    );

    test(
      'OrderSummary decodes subtotal from both numeric and string values',
      () {
        final jsonWithDouble = {
          'order_number': 'SO-1234',
          'public_token': 'order-token-123',
          'status': 'accepted',
          'subtotal': 180.0,
          'dining_session_token': 'sess-abc',
        };

        final summaryWithDouble = OrderSummary.fromJson(jsonWithDouble);
        expect(summaryWithDouble.subtotal, 180.0);
        expect(summaryWithDouble.orderNumber, 'SO-1234');

        final jsonWithString = {
          'order_number': 'SO-5678',
          'public_token': 'order-token-567',
          'status': 'pending',
          'subtotal': '180.00',
        };

        final summaryWithString = OrderSummary.fromJson(jsonWithString);
        expect(summaryWithString.subtotal, 180.0);
        expect(summaryWithString.orderNumber, 'SO-5678');
      },
    );

    test('MenuItem parses price as double correctly', () {
      final itemJson = {
        'id': 101,
        'name': 'Paneer Tikka',
        'price': 280.0,
        'is_available': true,
      };

      final item = MenuItem.fromJson(itemJson);
      expect(item.id, 101);
      expect(item.price, 280.0);
    });

    test(
      'OperationsApi.createStaffOrder decodes backend-style response cleanly',
      () async {
        final mockResponse = {
          'order_number': 'SO-9999',
          'public_token': 'ord_token_abc',
          'status': 'accepted',
          'subtotal': 180.0,
          'dining_session_token': 'dining_session_xyz',
          'session_subtotal': 180.0,
          'session_order_count': 1,
          'can_order_more': true,
        };

        final client = ApiClient(
          baseUrl: Uri.parse('https://omlu-api.onrender.com'),
          transport: (request) async {
            return ApiResponse(
              statusCode: 200,
              headers: const {'content-type': 'application/json'},
              body: mockResponse,
            );
          },
        );

        final api = OperationsApi(client);
        final summary = await api.createStaffOrder(
          tableId: 5,
          draft: const StaffOrderDraft(items: []),
          idempotencyKey: 'test-key',
        );

        expect(summary.orderNumber, 'SO-9999');
        expect(summary.publicToken, 'ord_token_abc');
        expect(summary.status, 'accepted');
        expect(summary.subtotal, 180.0);
        expect(summary.diningSessionToken, 'dining_session_xyz');
      },
    );
  });
}
