import 'api_client.dart';
import 'api_exceptions.dart';
import '../models/operations_models.dart';
import '../storage/operations_data_cache.dart';
import '../printing/receipt_data.dart';
import 'dart:typed_data';

class AuthenticatedDownload {
  const AuthenticatedDownload({required this.bytes, required this.fileName});
  final Uint8List bytes;
  final String fileName;
}

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

  Future<Map<String, Object?>> cancelStaffOrderItem({
    required int tableId,
    required String orderPublicToken,
    required int orderItemId,
    required String reason,
  }) async {
    final json = await _client.postJson(
      '/staff/tables/$tableId/orders/$orderPublicToken/items/$orderItemId/cancel',
      body: <String, Object?>{'reason': reason.trim()},
    );
    await _cache?.invalidate('tables', identifier: 'all');
    return json;
  }

  Future<Map<String, Object?>> reopenBillOrdering({
    required String billNumber,
    required String reason,
    required String idempotencyKey,
  }) async {
    final json = await _client.postJson(
      '/staff/bills/$billNumber/reopen-ordering',
      body: <String, Object?>{'reason': reason},
      idempotencyKey: idempotencyKey,
    );
    await _cache?.invalidate('tables', identifier: 'all');
    return json;
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

  Future<Map<String, Object?>> fetchQuickSales() =>
      _client.getJson('/admin/quick-sales');

  Future<Map<String, Object?>> previewQuickSale(Map<String, Object?> body) =>
      _client.postJson('/admin/quick-sales/preview', body: body);

  Future<Map<String, Object?>> createQuickSale({
    required Map<String, Object?> body,
    required String idempotencyKey,
  }) => _client.postJson(
    '/admin/quick-sales',
    body: body,
    idempotencyKey: idempotencyKey,
  );

  Future<Map<String, Object?>> payQuickSale({
    required String publicToken,
    required String method,
    required String idempotencyKey,
  }) => _client.postJson(
    '/admin/quick-sales/$publicToken/payment',
    body: {'method': method},
    idempotencyKey: idempotencyKey,
  );

  Future<ReceiptData> fetchQuickSaleReceipt(String publicToken) async =>
      ReceiptData.fromJson(
        Map<String, dynamic>.from(
          await _client.getJson(
            '/admin/quick-sales/$publicToken/receipt-payload',
          ),
        ),
      );

  Future<AuthenticatedDownload> downloadAdminExport(
    String path, {
    Map<String, String> query = const {},
  }) async {
    if (!path.startsWith('/admin/history/') &&
        !path.startsWith('/admin/gst/')) {
      throw ArgumentError.value(path, 'path', 'Unsupported export endpoint');
    }
    final response = await _client.getBinary(path, query: query);
    final disposition = response.headers['content-disposition'] ?? '';
    final match = RegExp(
      r'''filename\*?=(?:UTF-8''|["'])?([^"';]+)''',
      caseSensitive: false,
    ).firstMatch(disposition);
    final fallback = '${path.split('/').where((e) => e.isNotEmpty).last}.bin';
    final raw = match?.group(1)?.trim() ?? fallback;
    final safe = Uri.decodeComponent(
      raw,
    ).replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    return AuthenticatedDownload(
      bytes: response.body! as Uint8List,
      fileName: safe,
    );
  }

  Future<List<Object?>> fetchStaffAccounts() {
    return _client.getList('/admin/staff');
  }

  Future<List<Object?>> fetchAdminCategories() =>
      _client.getList('/admin/categories');

  Future<Map<String, Object?>> saveAdminCategory({
    int? id,
    required Map<String, Object?> values,
  }) => id == null
      ? _client.postJson('/admin/categories', body: values)
      : _client.patchJson('/admin/categories/$id', body: values);

  Future<void> deleteAdminCategory(int id) =>
      _client.delete('/admin/categories/$id');

  Future<List<Object?>> fetchAdminMenuItems({
    int? categoryId,
    String? search,
  }) => _client.getList(
    '/admin/menu-items',
    query: {
      if (categoryId != null) 'category_id': '$categoryId',
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    },
  );

  Future<Map<String, Object?>> saveAdminMenuItem({
    int? id,
    required Map<String, Object?> values,
  }) => id == null
      ? _client.postJson('/admin/menu-items', body: values)
      : _client.patchJson('/admin/menu-items/$id', body: values);

  Future<void> deleteAdminMenuItem(int id) =>
      _client.delete('/admin/menu-items/$id');

  Future<Map<String, Object?>> setMenuItemAvailability(int id, bool value) =>
      _client.patchJson(
        '/staff/availability/items/$id',
        body: {'is_available': value},
      );

  Future<List<Object?>> fetchOptionGroups() =>
      _client.getList('/admin/menu/option-groups');

  Future<Map<String, Object?>> saveOptionGroup({
    int? id,
    required Map<String, Object?> values,
  }) => id == null
      ? _client.postJson('/admin/menu/option-groups', body: values)
      : _client.patchJson('/admin/menu/option-groups/$id', body: values);

  Future<Map<String, Object?>> saveMenuOption({
    int? id,
    required Map<String, Object?> values,
  }) => id == null
      ? _client.postJson('/admin/menu/options', body: values)
      : _client.patchJson('/admin/menu/options/$id', body: values);

  Future<void> deleteMenuOption(int id) =>
      _client.delete('/admin/menu/options/$id');

  Future<Map<String, Object?>> attachOptionGroup(int itemId, int groupId) =>
      _client.postJson(
        '/admin/menu/items/$itemId/option-groups',
        body: {'option_group_id': groupId, 'display_order': 0, 'active': true},
      );

  Future<Map<String, Object?>> createStaffAccount(
    Map<String, Object?> values,
  ) => _client.postJson('/admin/staff', body: values);

  Future<Map<String, Object?>> updateStaffAccount(
    int id,
    Map<String, Object?> values,
  ) => _client.patchJson('/admin/staff/$id', body: values);

  Future<void> deleteStaffAccount(int id) => _client.delete('/admin/staff/$id');

  Future<Map<String, Object?>> revokeStaffSessions(int id) =>
      _client.postJson('/admin/staff/$id/sessions/revoke');

  Future<Map<String, Object?>> resetStaffPassword(int id, String password) =>
      _client.postJson(
        '/admin/staff/$id/reset-password',
        body: {'temporary_password': password},
      );

  Future<Map<String, Object?>> fetchRestaurantSettings() =>
      _client.getJson('/admin/settings');

  Future<Map<String, Object?>> updateRestaurantSettings(
    Map<String, Object?> values,
  ) => _client.patchJson('/admin/settings', body: values);

  Future<Map<String, Object?>> fetchPerformanceSummary({
    String preset = 'today',
  }) =>
      _client.getJson('/admin/history/performance', query: {'preset': preset});

  Future<Map<String, Object?>> fetchGstSummary({String preset = 'today'}) =>
      _client.getJson('/admin/gst/summary', query: {'preset': preset});

  Future<List<Object?>> fetchPrintBridgeInstallations() async {
    final response = await _client.getJson('/print-bridge/installations');
    return response['installations'] as List<Object?>? ?? const [];
  }

  Future<Map<String, Object?>> fetchHistory({
    required String resource,
    String preset = 'today',
    DateTime? startDate,
    DateTime? endDate,
    String? status,
    String? search,
    String? paymentMethod,
    int page = 1,
    int pageSize = 25,
  }) => _client.getJson(
    '/admin/history/$resource',
    query: {
      'preset': startDate == null ? preset : 'custom',
      if (startDate != null)
        'start_date': startDate.toIso8601String().substring(0, 10),
      if (endDate != null)
        'end_date': endDate.toIso8601String().substring(0, 10),
      if (status != null && status.isNotEmpty) 'status_filter': status,
      if (resource == 'orders' && search != null && search.trim().isNotEmpty)
        'order_number': search.trim(),
      if (resource == 'bills' &&
          paymentMethod != null &&
          paymentMethod.isNotEmpty)
        'payment_method': paymentMethod,
      'page': '$page',
      'page_size': '$pageSize',
    },
  );

  Future<Map<String, Object?>> fetchHistoryOrderDetail(int id) =>
      _client.getJson('/admin/history/orders/$id');

  Future<Map<String, Object?>> fetchGstRegister({
    required String resource,
    String preset = 'today',
    int page = 1,
  }) => _client.getJson(
    '/admin/gst/$resource',
    query: {
      'preset': preset,
      if (resource == 'sales-register') 'page': '$page',
      if (resource == 'sales-register') 'limit': '25',
    },
  );

  Future<Map<String, Object?>> fetchStaffOperations() =>
      _client.getJson('/admin/staff/operations');

  Future<Map<String, Object?>> updateRestaurantOperatingStatus(String status) =>
      _client.postJson(
        '/admin/staff/operations/status',
        body: {'status': status},
      );

  Future<Map<String, Object?>> setAllStaffLocked({
    required bool locked,
    String? reason,
    bool confirmActiveOperations = false,
  }) => _client.postJson(
    '/admin/staff/operations/${locked ? 'lock' : 'unlock'}',
    body: locked
        ? {
            'reason': reason,
            'confirm_active_operations': confirmActiveOperations,
          }
        : null,
  );

  Future<List<Object?>> fetchKitchenPrintJobs({String? status}) async {
    final response = await _client.getJson(
      '/print-bridge/kitchen-jobs',
      query: {if (status != null && status.isNotEmpty) 'job_status': status},
    );
    return response['jobs'] as List<Object?>? ?? const [];
  }

  Future<Map<String, Object?>> retryKitchenPrintJob(int id) =>
      _client.postJson('/print-bridge/kitchen-jobs/$id/retry');

  Future<Map<String, Object?>> revokePrintBridgeInstallation(String id) =>
      _client.postJson(
        '/print-bridge/revoke-installation',
        body: {'installation_id': id},
      );

  Future<List<Object?>> fetchActiveSessions() {
    return _client.getList('/staff/sessions');
  }

  Future<Map<String, Object?>> fetchSessionParticipants(String sessionToken) {
    return _client.getJson('/staff/table-sessions/$sessionToken/participants');
  }

  Future<Map<String, Object?>> rotateSessionJoinCode(String sessionToken) {
    return _client.postJson(
      '/staff/table-sessions/$sessionToken/rotate-join-code',
    );
  }

  Future<Map<String, Object?>> revokeSessionParticipant({
    required String sessionToken,
    required String participantId,
    required String reason,
  }) {
    return _client.postJson(
      '/staff/table-sessions/$sessionToken/participants/$participantId/revoke',
      body: {'reason': reason},
    );
  }

  Future<Map<String, Object?>> closeEmptySession(String sessionToken) {
    return _client.postJson('/staff/sessions/$sessionToken/close-empty');
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

  Future<Map<String, Object?>> fetchBillingCounter() {
    return _client.getJson('/staff/bills/billing-counter');
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
