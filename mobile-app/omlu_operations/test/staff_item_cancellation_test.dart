import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';

void main() {
  test('staff cancellation uses the backend route and required reason', () async {
    ApiRequest? captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(
            statusCode: 200,
            body: {
              'order_number': 'O-1',
              'public_token': 'order-token',
              'status': 'accepted',
              'subtotal': '75.00',
            },
          );
        },
      ),
    );

    await api.cancelStaffOrderItem(
      tableId: 12,
      orderPublicToken: 'order-token',
      orderItemId: 44,
      reason: 'Customer changed mind',
    );

    expect(captured?.method, 'POST');
    expect(
      captured?.uri.path,
      '/staff/tables/12/orders/order-token/items/44/cancel',
    );
    expect(captured?.body, {'reason': 'Customer changed mind'});
  });
}
