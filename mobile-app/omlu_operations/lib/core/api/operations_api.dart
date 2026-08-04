import 'api_client.dart';
import 'api_exceptions.dart';
import '../models/operations_models.dart';
import '../storage/operations_data_cache.dart';
import '../printing/receipt_data.dart';

class OperationsApi {
  OperationsApi(this._client, {OperationsDataCache? cache}) : _cache = cache;

  final ApiClient _client;
  final OperationsDataCache? _cache;

  Future<List<StaffTableSummary>> fetchStaffTables({
    String filter = 'all',
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh) {
      final cached = await _cache?.read(
        'tables',
        identifier: filter,
        maxAge: const Duration(minutes: 2),
      );
      if (cached is List) {
        return [
          for (final item in cached)
            StaffTableSummary.fromJson(Map<String, Object?>.from(item as Map)),
        ];
      }
    }
    final json = await _client.getJson(
      '/staff/tables',
      query: {'filter': filter},
    );
    final items = json['items'] as List? ?? const [];
    await _cache?.write('tables', items, identifier: filter);
    return [
      for (final item in items)
        StaffTableSummary.fromJson(Map<String, Object?>.from(item as Map)),
    ];
  }

  Future<Map<String, Object?>> fetchStaffTableDetail(int tableId) {
    // This response also contains live session/bill state, so it is never
    // persisted. Riverpod retains it in memory while the screen is active.
    return _client.getJson('/staff/tables/$tableId');
  }

  Future<EmptyTableReport> reportTableEmpty({
    required int tableId,
    required String sessionToken,
  }) async {
    final json = await _client.postJson(
      '/staff/tables/$tableId/empty-table-report',
      body: <String, Object?>{'session_token': sessionToken},
    );
    await _cache?.invalidate('tables', identifier: 'all');
    return EmptyTableReport.fromJson(json);
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
    await _cache?.invalidate('tables', identifier: 'all');
    return OrderSummary.fromJson(json);
  }

  Future<OrderSummary> createStaffServedItem({
    required int tableId,
    required StaffOrderDraft draft,
    required String reason,
    required String idempotencyKey,
  }) async {
    final body = draft.toJson()..['late_entry_reason'] = reason;
    final json = await _client.postJson(
      '/staff/tables/$tableId/served-items',
      body: body,
      idempotencyKey: idempotencyKey,
    );
    await _cache?.invalidate('tables', identifier: 'all');
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

  Future<Map<String, Object?>> issueBill(
    String billNumber, {
    String? idempotencyKey,
  }) {
    return _client.postJson(
      '/staff/bills/$billNumber/issue',
      idempotencyKey: idempotencyKey ?? 'bill-issue-$billNumber-v1',
    );
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

  Future<BillDetail> fetchBillDetail(String billNumber) async {
    final json = await fetchBill(billNumber);
    return BillDetail.fromJson(json);
  }

  Future<ReceiptData> fetchReceiptPayload(String billNumber) async {
    final json = await _client.getJson(
      '/staff/bills/$billNumber/receipt-payload',
    );
    return ReceiptData.fromJson(Map<String, dynamic>.from(json));
  }

  Future<PaymentCodeLookupResult> lookupPendingPaymentCode(String code) async {
    final normalized = code
        .replaceAll(
          RegExp(r'[^2346789ABCDEFGHJKLMNPQRTUVWXYZ]', caseSensitive: false),
          '',
        )
        .toUpperCase();

    if (!RegExp(
      r'^[2346789ABCDEFGHJKLMNPQRTUVWXYZ]{6}$',
    ).hasMatch(normalized)) {
      throw const ValidationException(
        'Enter a valid 6-character payment code.',
      );
    }

    try {
      final json = await _client.postJson(
        '/staff/bills/payment-code/lookup',
        body: <String, Object?>{'payment_code': normalized},
      );
      return PaymentCodeLookupResult.fromJson(json);
    } on NotFoundException catch (e) {
      throw NotFoundException(
        'We could not find an unpaid bill with this code. Check the code and try again.',
        statusCode: e.statusCode,
      );
    } on RateLimitException catch (e) {
      throw RateLimitException(
        'Too many payment-code lookup attempts. Please wait a moment and try again.',
        statusCode: e.statusCode,
      );
    } on PermissionDeniedException catch (e) {
      throw PermissionDeniedException(
        'You can view this bill, but only an owner or admin can confirm payment.',
        statusCode: e.statusCode,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 400 || e.statusCode == 404) {
        throw NotFoundException(
          'We could not find an unpaid bill with this code. Check the code and try again.',
          statusCode: e.statusCode,
        );
      }
      rethrow;
    } catch (e) {
      throw ApiException(
        'Could not connect to OMLU. Check the internet connection and try again.',
      );
    }
  }

  Future<Map<String, Object?>> confirmCounterPayment({
    required String billNumber,
    required String method,
    String? idempotencyKey,
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
      idempotencyKey: idempotencyKey ?? 'bill-payment-$billNumber-$method-v1',
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
