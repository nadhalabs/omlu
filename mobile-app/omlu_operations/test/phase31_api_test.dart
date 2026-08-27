import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';

void main() {
  test(
    'quick sale sends authoritative payload once with idempotency and no tenant id',
    () async {
      final requests = <ApiRequest>[];
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://restaurant.example'),
          accessToken: 'secret',
          transport: (request) async {
            requests.add(request);
            return const ApiResponse(
              statusCode: 201,
              body: {'status': 'completed'},
            );
          },
        ),
      );
      final body = <String, Object?>{
        'sale_type': 'late_entry',
        'payment_method': 'cash',
        'items': [
          <String, Object?>{
            'menu_item_id': 7,
            'quantity': 2,
            'selected_options': [
              <String, Object?>{'group_id': 3, 'option_id': 4, 'quantity': 1},
            ],
          },
        ],
      };
      await api.createQuickSale(body: body, idempotencyKey: 'attempt-1');
      expect(requests, hasLength(1));
      expect(requests.single.uri.path, '/admin/quick-sales');
      expect(requests.single.headers['Idempotency-Key'], 'attempt-1');
      expect(requests.single.headers['Authorization'], 'Bearer secret');
      expect(
        (requests.single.body as Map).containsKey('restaurant_id'),
        isFalse,
      );
      expect(requests.single.body, body);
    },
  );

  test(
    'preview and payment remain separate server-authoritative operations',
    () async {
      final requests = <ApiRequest>[];
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://restaurant.example'),
          accessToken: 'secret',
          transport: (request) async {
            requests.add(request);
            return ApiResponse(
              statusCode: 200,
              body: request.uri.path.endsWith('/preview')
                  ? {'grand_total': '118.00', 'tax_amount': '18.00'}
                  : {'status': 'completed'},
            );
          },
        ),
      );
      await api.previewQuickSale({
        'sale_type': 'takeaway',
        'items': [
          {'menu_item_id': 1, 'quantity': 1},
        ],
      });
      await api.payQuickSale(
        publicToken: 'qs_safe',
        method: 'upi',
        idempotencyKey: 'payment-attempt',
      );
      expect(requests[0].uri.path, '/admin/quick-sales/preview');
      expect(requests[1].uri.path, '/admin/quick-sales/qs_safe/payment');
      expect(requests[1].headers['Idempotency-Key'], 'payment-attempt');
    },
  );

  test('export uses authenticated request and server filename', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://restaurant.example'),
        accessToken: 'secret',
        transport: (request) async {
          captured = request;
          return ApiResponse(
            statusCode: 200,
            body: Uint8List.fromList([1, 2, 3]),
            headers: const {
              'content-disposition': 'attachment; filename="performance.xlsx"',
            },
          );
        },
      ),
    );
    final file = await api.downloadAdminExport(
      '/admin/history/performance/export.xlsx',
      query: {'preset': 'today'},
    );
    expect(captured.headers['Authorization'], 'Bearer secret');
    expect(captured.uri.queryParameters, {'preset': 'today'});
    expect(captured.uri.toString(), isNot(contains('secret')));
    expect(file.fileName, 'performance.xlsx');
    expect(file.bytes, [1, 2, 3]);
  });
}
