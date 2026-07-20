import 'api_client.dart';
import '../models/operations_models.dart';

class OperationsApi {
  const OperationsApi(this._client);

  final ApiClient _client;

  Future<List<StaffTableSummary>> fetchStaffTables({
    String filter = 'all',
  }) async {
    final json = await _client.getJson(
      '/staff/tables',
      query: {'filter': filter},
    );
    final items = json['items'] as List? ?? const [];
    return [
      for (final item in items)
        StaffTableSummary.fromJson(Map<String, Object?>.from(item as Map)),
    ];
  }

  Future<Map<String, Object?>> fetchStaffTableDetail(int tableId) {
    return _client.getJson('/staff/tables/$tableId');
  }

  Future<OrderSummary> createStaffOrder({
    required int tableId,
    required StaffOrderDraft draft,
    required String idempotencyKey,
  }) async {
    final json = await _client.postJson(
      '/staff/tables/$tableId/orders',
      body: draft.toJson(),
      idempotencyKey: idempotencyKey,
    );
    return OrderSummary.fromJson(json);
  }

  Future<List<KitchenOrder>> fetchKitchenOrders({
    required String restaurantSlug,
    String? status,
    int limit = 100,
    DateTime? since,
  }) async {
    final query = <String, String>{
      'limit': '$limit',
      ...?(status == null ? null : {'status': status}),
      ...?(since == null ? null : {'since': since.toIso8601String()}),
    };
    final list = await _client.getList(
      '/kitchen/restaurants/$restaurantSlug/orders',
      query: query,
    );
    return [
      for (final item in list)
        KitchenOrder.fromJson(Map<String, Object?>.from(item as Map)),
    ];
  }

  Future<KitchenOrder> updateKitchenStatus({
    required String restaurantSlug,
    required String publicToken,
    required String status,
  }) async {
    final json = await _client.patchJson(
      '/kitchen/restaurants/$restaurantSlug/orders/$publicToken/status',
      body: {'status': status},
    );
    return KitchenOrder.fromJson(json);
  }

  Future<Map<String, Object?>> fetchDashboardSummary() {
    return _client.getJson('/admin/dashboard/summary');
  }

  Future<List<Object?>> fetchStaffAccounts() {
    return _client.getList('/admin/staff');
  }

  Future<Map<String, Object?>> generateTableBill(int tableId) {
    return _client.postJson('/staff/tables/$tableId/bill');
  }

  Future<Map<String, Object?>> issueBill(String billNumber) {
    return _client.postJson('/staff/bills/$billNumber/issue');
  }

  Future<Map<String, Object?>> sendBillToCounter(String billNumber) {
    return _client.postJson('/staff/bills/$billNumber/send-to-counter');
  }

  Future<List<Object?>> fetchPendingPayments() async {
    final response = await _client.getJson('/staff/bills/pending-payments');
    return (response['items'] as List<Object?>?) ?? const [];
  }

  Future<Map<String, Object?>> fetchBill(String billNumber) {
    return _client.getJson('/staff/bills/$billNumber');
  }

  Future<Map<String, Object?>> confirmCounterPayment({
    required String billNumber,
    required String method,
  }) {
    if (method != 'counter_cash' && method != 'counter_upi') {
      throw ArgumentError.value(
        method,
        'method',
        'Only Cash or UPI is supported',
      );
    }
    return _client.postJson(
      '/staff/bills/$billNumber/confirm-counter-payment',
      body: {'method': method},
    );
  }

  Future<Map<String, Object?>> requestTableBill(int tableId) {
    return _client.postJson('/staff/tables/$tableId/bill-request');
  }

  Future<List<Object?>> fetchServiceRequests({
    String statusFilter = 'pending',
  }) {
    return _client.getList(
      '/staff/service-requests',
      query: {'status_filter': statusFilter},
    );
  }

  Future<Map<String, Object?>> fetchOperationalOrderHistory() {
    return _client.getJson(
      '/admin/history/orders',
      query: {'page': '1', 'page_size': '50', 'preset': 'today'},
    );
  }

  Future<Map<String, Object?>> resolveServiceRequest(int requestId) {
    return _client.patchJson('/staff/service-requests/$requestId/resolve');
  }
}
