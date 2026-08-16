String readString(dynamic value, {String fallback = ''}) {
  if (value == null) return fallback;
  return value.toString();
}

double readDouble(dynamic value, {double fallback = 0}) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? fallback;
}

int readInt(dynamic value, {int fallback = 0}) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

int readRequiredId(dynamic value, String fieldName) {
  if (value == null) {
    throw FormatException('Missing required identifier: $fieldName');
  }
  if (value is num) return value.toInt();
  final parsed = int.tryParse(value.toString());
  if (parsed == null) {
    throw FormatException('Invalid identifier for $fieldName: $value');
  }
  return parsed;
}

class MenuOptionSelection {
  const MenuOptionSelection({
    required this.groupId,
    required this.optionId,
    this.quantity = 1,
  });

  final int groupId;
  final int optionId;
  final int quantity;

  Map<String, Object?> toJson() => {
    'group_id': groupId,
    'option_id': optionId,
    'quantity': quantity,
  };
}

class OrderItemDraft {
  const OrderItemDraft({
    required this.menuItemId,
    required this.quantity,
    this.itemNote,
    this.selectedOptions = const [],
  });

  final int menuItemId;
  final int quantity;
  final String? itemNote;
  final List<MenuOptionSelection> selectedOptions;

  Map<String, Object?> toJson() => {
    'menu_item_id': menuItemId,
    'quantity': quantity,
    if (itemNote != null) 'item_note': itemNote,
    'selected_options': [for (final option in selectedOptions) option.toJson()],
  };
}

class StaffOrderDraft {
  const StaffOrderDraft({required this.items, this.customerNote});

  final List<OrderItemDraft> items;
  final String? customerNote;

  Map<String, Object?> toJson() => {
    'items': [for (final item in items) item.toJson()],
    if (customerNote != null) 'customer_note': customerNote,
  };
}

class StaffTableSummary {
  const StaffTableSummary({
    required this.id,
    required this.tableNumber,
    required this.state,
    required this.hasOpenSession,
    required this.activeOrderCount,
    required this.currentBillAmount,
    required this.attention,
    required this.billRequested,
    this.sessionToken,
    this.sessionStatus,
    this.openedMinutesAgo,
    this.activeSessionId,
    this.billId,
    this.billStatus,
    this.billNumber,
    this.hasActiveBillRequest = false,
    this.emptyTableReport,
  });

  factory StaffTableSummary.fromJson(Map<String, Object?> json) {
    return StaffTableSummary.fromListJson(json);
  }

  factory StaffTableSummary.fromListJson(Map<String, Object?> json) {
    final id = readRequiredId(json['id'], 'id');
    final tableNumber = readString(json['table_number']);
    final state = readString(json['state'], fallback: 'available');
    final hasOpenSession = json['has_open_session'] as bool? ?? false;
    final sessionToken = json['session_token'] == null
        ? null
        : readString(json['session_token']);
    final sessionStatus = json['session_status'] == null
        ? null
        : readString(json['session_status']);
    final activeOrderCount = readInt(json['active_order_count']);
    final currentBillAmount = readDouble(json['current_bill_amount']);
    final openedMinutesAgo = json['opened_minutes_ago'] == null
        ? null
        : readInt(json['opened_minutes_ago']);
    final attention = [
      for (final value in (json['attention'] as List? ?? const []))
        readString(value),
    ];
    final billRequested = json['bill_requested'] as bool? ?? false;
    final emptyTableReport = EmptyTableReport.tryParse(
      json['empty_table_report'],
    );

    return StaffTableSummary(
      id: id,
      tableNumber: tableNumber,
      state: state,
      hasOpenSession: hasOpenSession,
      sessionToken: sessionToken,
      sessionStatus: sessionStatus,
      activeOrderCount: activeOrderCount,
      currentBillAmount: currentBillAmount,
      openedMinutesAgo: openedMinutesAgo,
      attention: attention,
      billRequested: billRequested,
      activeSessionId: null,
      billId: null,
      billStatus: null,
      billNumber: null,
      hasActiveBillRequest: billRequested || attention.contains('bill'),
      emptyTableReport: emptyTableReport,
    );
  }

  factory StaffTableSummary.fromDetailJson(Map<String, Object?> json) {
    final tableMap = json['table'] as Map<String, Object?>? ?? const {};
    final sessionMap = json['session'] as Map<String, Object?>?;
    final billMap = sessionMap != null
        ? (sessionMap['bill'] as Map<String, Object?>?)
        : null;

    final id = readRequiredId(tableMap['id'] ?? json['id'], 'id');
    final tableNumber = readString(
      tableMap['table_number'] ?? json['table_number'],
    );
    final state = readString(
      tableMap['state'] ?? json['state'],
      fallback: 'available',
    );
    final hasOpenSession =
        tableMap['has_open_session'] as bool? ?? (sessionMap != null);

    final sessionToken = tableMap['session_token'] != null
        ? readString(tableMap['session_token'])
        : (sessionMap != null && sessionMap['session_token'] != null
              ? readString(sessionMap['session_token'])
              : (json['session_token'] != null
                    ? readString(json['session_token'])
                    : null));

    final sessionStatus = tableMap['session_status'] != null
        ? readString(tableMap['session_status'])
        : (sessionMap != null && sessionMap['status'] != null
              ? readString(sessionMap['status'])
              : (json['session_status'] != null
                    ? readString(json['session_status'])
                    : (json['status'] != null
                          ? readString(json['status'])
                          : null)));

    final activeOrderCount = tableMap['active_order_count'] != null
        ? readInt(tableMap['active_order_count'])
        : (sessionMap != null
              ? (sessionMap['orders'] as List?)?.length ?? 0
              : 0);

    final currentBillAmount = readDouble(
      tableMap['current_bill_amount'] ?? json['current_bill_amount'],
    );

    final openedMinutesAgo = tableMap['opened_minutes_ago'] != null
        ? readInt(tableMap['opened_minutes_ago'])
        : (json['opened_minutes_ago'] != null
              ? readInt(json['opened_minutes_ago'])
              : null);

    final attention = [
      for (final value
          in (tableMap['attention'] as List? ??
              json['attention'] as List? ??
              const []))
        readString(value),
    ];
    final billRequested =
        tableMap['bill_requested'] as bool? ??
        json['bill_requested'] as bool? ??
        false;

    final activeSessionId = (sessionMap != null && sessionMap['id'] != null)
        ? readInt(sessionMap['id'])
        : null;
    final billId = (billMap != null && billMap['id'] != null)
        ? readInt(billMap['id'])
        : null;
    final billStatus = (billMap != null && billMap['status'] != null)
        ? readString(billMap['status'])
        : null;
    final billNumber = (billMap != null && billMap['bill_number'] != null)
        ? readString(billMap['bill_number'])
        : null;
    final requestsList = json['requests'] as List?;
    final hasPendingBillRequest =
        requestsList != null &&
        requestsList.any((req) {
          if (req is Map) {
            return readString(req['request_type']) == 'bill' &&
                readString(req['status']) == 'pending';
          }
          return false;
        });
    final hasActiveBillRequest =
        billRequested || attention.contains('bill') || hasPendingBillRequest;
    final emptyTableReport = EmptyTableReport.tryParse(
      json['empty_table_report'] ?? tableMap['empty_table_report'],
    );

    return StaffTableSummary(
      id: id,
      tableNumber: tableNumber,
      state: state,
      hasOpenSession: hasOpenSession,
      sessionToken: sessionToken,
      sessionStatus: sessionStatus,
      activeOrderCount: activeOrderCount,
      currentBillAmount: currentBillAmount,
      openedMinutesAgo: openedMinutesAgo,
      attention: attention,
      billRequested: billRequested,
      activeSessionId: activeSessionId,
      billId: billId,
      billStatus: billStatus,
      billNumber: billNumber,
      hasActiveBillRequest: hasActiveBillRequest,
      emptyTableReport: emptyTableReport,
    );
  }

  final int id;
  final String tableNumber;
  final String state;
  final bool hasOpenSession;
  final String? sessionToken;
  final String? sessionStatus;
  final int activeOrderCount;
  final double currentBillAmount;
  final int? openedMinutesAgo;
  final List<String> attention;
  final bool billRequested;
  final int? activeSessionId;
  final int? billId;
  final String? billStatus;
  final String? billNumber;
  final bool hasActiveBillRequest;
  final EmptyTableReport? emptyTableReport;

  StaffTableSummary copyWith({
    bool? hasOpenSession,
    String? sessionToken,
    String? sessionStatus,
    EmptyTableReport? emptyTableReport,
    bool clearEmptyTableReport = false,
  }) => StaffTableSummary(
    id: id,
    tableNumber: tableNumber,
    state: state,
    hasOpenSession: hasOpenSession ?? this.hasOpenSession,
    sessionToken: sessionToken ?? this.sessionToken,
    sessionStatus: sessionStatus ?? this.sessionStatus,
    activeOrderCount: activeOrderCount,
    currentBillAmount: currentBillAmount,
    openedMinutesAgo: openedMinutesAgo,
    attention: attention,
    billRequested: billRequested,
    activeSessionId: activeSessionId,
    billId: billId,
    billStatus: billStatus,
    billNumber: billNumber,
    hasActiveBillRequest: hasActiveBillRequest,
    emptyTableReport: clearEmptyTableReport
        ? null
        : emptyTableReport ?? this.emptyTableReport,
  );
}

class EmptyTableReport {
  const EmptyTableReport({
    this.status = 'open',
    this.sessionToken,
    this.reportedByName,
    this.reportedAt,
  });

  factory EmptyTableReport.fromJson(Map<String, Object?> json) =>
      EmptyTableReport(
        status: readString(json['status'], fallback: 'open'),
        sessionToken: json['session_token'] == null
            ? null
            : readString(json['session_token']),
        reportedByName: json['reported_by_name'] == null
            ? null
            : readString(json['reported_by_name']),
        reportedAt: DateTime.tryParse(readString(json['reported_at']))?.toUtc(),
      );

  static EmptyTableReport? tryParse(Object? value) {
    if (value is! Map) return null;
    return EmptyTableReport.fromJson(Map<String, Object?>.from(value));
  }

  final String status;
  final String? sessionToken;
  final String? reportedByName;
  final DateTime? reportedAt;
}

class OrderSummary {
  const OrderSummary({
    required this.orderNumber,
    required this.publicToken,
    required this.status,
    required this.subtotal,
    this.diningSessionToken,
  });

  factory OrderSummary.fromJson(Map<String, Object?> json) {
    return OrderSummary(
      orderNumber: readString(json['order_number']),
      publicToken: readString(json['public_token']),
      status: readString(json['status']),
      subtotal: readDouble(json['subtotal']),
      diningSessionToken: json['dining_session_token'] == null
          ? null
          : readString(json['dining_session_token']),
    );
  }

  final String orderNumber;
  final String publicToken;
  final String status;
  final double subtotal;
  final String? diningSessionToken;
}

class KitchenOrderItem {
  const KitchenOrderItem({
    this.id,
    required this.name,
    required this.quantity,
    this.note,
    this.selectedOptions = const [],
    this.cancellationStatus = 'active',
    this.cancellationReason,
    this.cancelledAt,
    this.cancellationActorType,
  });

  factory KitchenOrderItem.fromJson(Map<String, Object?> json) {
    return KitchenOrderItem(
      id: json['id'] == null ? null : readInt(json['id']),
      name: readString(
        json['name'] ?? json['menu_item_name'] ?? json['item_name'],
      ),
      quantity: readInt(json['quantity'], fallback: 1),
      note: json['item_note'] == null
          ? (json['note'] == null ? null : readString(json['note']))
          : readString(json['item_note']),
      selectedOptions: [
        for (final raw in json['selected_options'] as List? ?? const [])
          if (raw is Map)
            readString(
              raw['kitchen_display_name'],
              fallback: readString(
                raw['option_name'],
                fallback: readString(raw['name']),
              ),
            ),
      ],
      cancellationStatus: readString(
        json['cancellation_status'],
        fallback: 'active',
      ),
      cancellationReason: json['cancellation_reason'] == null
          ? null
          : readString(json['cancellation_reason']),
      cancelledAt: json['cancelled_at'] == null
          ? null
          : DateTime.tryParse(readString(json['cancelled_at']))?.toUtc(),
      cancellationActorType: json['cancellation_actor_type'] == null
          ? null
          : readString(json['cancellation_actor_type']),
    );
  }

  final int? id;
  final String name;
  final int quantity;
  final String? note;
  final List<String> selectedOptions;
  final String cancellationStatus;
  final String? cancellationReason;
  final DateTime? cancelledAt;
  final String? cancellationActorType;

  bool get isCancelled => cancellationStatus == 'cancelled';
  int get actionableQuantity => isCancelled ? 0 : quantity;

  KitchenOrderItem cancelled({String? reason, DateTime? at, String? actor}) {
    if (isCancelled) return this;
    return KitchenOrderItem(
      id: id,
      name: name,
      quantity: quantity,
      note: note,
      selectedOptions: selectedOptions,
      cancellationStatus: 'cancelled',
      cancellationReason: reason,
      cancelledAt: at,
      cancellationActorType: actor,
    );
  }
}

class KitchenOrder {
  const KitchenOrder({
    required this.orderNumber,
    required this.publicToken,
    required this.tableNumber,
    required this.status,
    required this.subtotal,
    required this.createdAt,
    this.items = const [],
    this.customerNote,
    this.source,
  });

  factory KitchenOrder.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'] as List? ?? const [];
    return KitchenOrder(
      orderNumber: readString(json['order_number']),
      publicToken: readString(json['public_token']),
      tableNumber: readString(json['table_number']),
      status: readString(json['status']),
      subtotal: readDouble(json['subtotal']),
      createdAt: DateTime.parse(readString(json['created_at'])),
      items: [
        for (final item in rawItems)
          KitchenOrderItem.fromJson(Map<String, Object?>.from(item as Map)),
      ],
      customerNote: json['customer_note'] == null
          ? null
          : readString(json['customer_note']),
      source: json['source'] == null ? null : readString(json['source']),
    );
  }

  final String orderNumber;
  final String publicToken;
  final String tableNumber;
  final String status;
  final double subtotal;
  final DateTime createdAt;
  final List<KitchenOrderItem> items;
  final String? customerNote;
  final String? source;

  int get actionableQuantity =>
      items.fold(0, (total, item) => total + item.actionableQuantity);

  bool get hasActionableItems => actionableQuantity > 0;

  KitchenOrder copyWith({
    String? status,
    double? subtotal,
    List<KitchenOrderItem>? items,
  }) {
    return KitchenOrder(
      orderNumber: orderNumber,
      publicToken: publicToken,
      tableNumber: tableNumber,
      status: status ?? this.status,
      subtotal: subtotal ?? this.subtotal,
      createdAt: createdAt,
      items: items ?? this.items,
      customerNote: customerNote,
      source: source,
    );
  }

  KitchenOrder applyItemCancellation(Map<String, Object?> eventState) {
    if (eventState['order_public_token']?.toString() != publicToken) return this;
    final itemId = int.tryParse(eventState['order_item_id']?.toString() ?? '');
    if (itemId == null) return this;
    final updated = [
      for (final item in items)
        if (item.id == itemId)
          item.cancelled(
            reason: eventState['cancellation_reason']?.toString(),
            at: DateTime.tryParse(eventState['cancelled_at']?.toString() ?? '')
                ?.toUtc(),
            actor: eventState['cancellation_actor_type']?.toString(),
          )
        else
          item,
    ];
    return copyWith(
      status: eventState['order_status']?.toString(),
      subtotal: double.tryParse(eventState['order_subtotal']?.toString() ?? ''),
      items: updated,
    );
  }
}

class PaymentCodeLookupResult {
  const PaymentCodeLookupResult({
    required this.billNumber,
    required this.restaurantName,
    required this.originalTable,
    required this.originalTableId,
    required this.sessionId,
    required this.billStatus,
    required this.sessionStatus,
    required this.amountDue,
    required this.currency,
    this.issuedAt,
    this.detachedAt,
    this.paymentCodeExpiresAt,
    this.waitingSeconds = 0,
    this.orderCount = 0,
    this.itemCount = 0,
    this.orderSummaryItems = const [],
    this.canConfirmPayment = false,
  });

  factory PaymentCodeLookupResult.fromJson(Map<String, Object?> json) {
    final summary = json['order_summary'] as Map<String, Object?>? ?? const {};
    return PaymentCodeLookupResult(
      billNumber: readString(json['bill_number']),
      restaurantName: readString(json['restaurant_name']),
      originalTable: readString(json['original_table']),
      originalTableId: readInt(json['original_table_id']),
      sessionId: readInt(json['session_id']),
      billStatus: readString(json['bill_status']),
      sessionStatus: readString(json['session_status']),
      amountDue: readDouble(json['amount_due']),
      currency: readString(json['currency'], fallback: 'INR'),
      issuedAt: json['issued_at'] == null
          ? null
          : DateTime.tryParse(readString(json['issued_at']))?.toUtc(),
      detachedAt: json['detached_at'] == null
          ? null
          : DateTime.tryParse(readString(json['detached_at']))?.toUtc(),
      paymentCodeExpiresAt: json['payment_code_expires_at'] == null
          ? null
          : DateTime.tryParse(
              readString(json['payment_code_expires_at']),
            )?.toUtc(),
      waitingSeconds: readInt(json['waiting_seconds']),
      orderCount: readInt(summary['order_count']),
      itemCount: readInt(summary['item_count']),
      orderSummaryItems: [
        for (final item in (summary['items'] as List? ?? const []))
          readString(item),
      ],
      canConfirmPayment: json['can_confirm_payment'] as bool? ?? false,
    );
  }

  final String billNumber;
  final String restaurantName;
  final String originalTable;
  final int originalTableId;
  final int sessionId;
  final String billStatus;
  final String sessionStatus;
  final double amountDue;
  final String currency;
  final DateTime? issuedAt;
  final DateTime? detachedAt;
  final DateTime? paymentCodeExpiresAt;
  final int waitingSeconds;
  final int orderCount;
  final int itemCount;
  final List<String> orderSummaryItems;
  final bool canConfirmPayment;

  bool get isExpired {
    if (paymentCodeExpiresAt == null) return false;
    return DateTime.now().toUtc().isAfter(paymentCodeExpiresAt!);
  }
}

class BillDetailItemOption {
  const BillDetailItemOption({
    required this.optionName,
    this.kitchenDisplayName,
    this.priceAdjustment = 0.0,
  });

  factory BillDetailItemOption.fromJson(Map<String, Object?> json) {
    return BillDetailItemOption(
      optionName: readString(
        json['kitchen_display_name'] ?? json['option_name'] ?? json['name'],
      ),
      kitchenDisplayName: json['kitchen_display_name'] == null
          ? null
          : readString(json['kitchen_display_name']),
      priceAdjustment: readDouble(json['price_adjustment']),
    );
  }

  final String optionName;
  final String? kitchenDisplayName;
  final double priceAdjustment;

  String get displayName => kitchenDisplayName ?? optionName;
}

class BillDetailItem {
  const BillDetailItem({
    required this.itemName,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    this.selectedOptions = const [],
    this.itemNote,
  });

  factory BillDetailItem.fromJson(Map<String, Object?> json) {
    final rawOptions = json['selected_options'] as List? ?? const [];
    return BillDetailItem(
      itemName: readString(json['item_name'] ?? json['name']),
      quantity: readInt(json['quantity'], fallback: 1),
      unitPrice: readDouble(json['unit_price']),
      lineTotal: readDouble(json['line_total'] ?? json['total_price']),
      selectedOptions: [
        for (final opt in rawOptions)
          if (opt is Map)
            BillDetailItemOption.fromJson(Map<String, Object?>.from(opt)),
      ],
      itemNote:
          json['item_note'] == null || readString(json['item_note']).isEmpty
          ? (json['note'] == null ? null : readString(json['note']))
          : readString(json['item_note']),
    );
  }

  final String itemName;
  final int quantity;
  final double unitPrice;
  final double lineTotal;
  final List<BillDetailItemOption> selectedOptions;
  final String? itemNote;
}

class BillDetailOrder {
  const BillDetailOrder({
    required this.orderNumber,
    required this.status,
    required this.subtotal,
    this.items = const [],
    this.customerNote,
  });

  factory BillDetailOrder.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'] as List? ?? const [];
    return BillDetailOrder(
      orderNumber: readString(json['order_number']),
      status: readString(json['status']),
      subtotal: readDouble(json['subtotal']),
      items: [
        for (final item in rawItems)
          if (item is Map)
            BillDetailItem.fromJson(Map<String, Object?>.from(item)),
      ],
      customerNote: json['customer_note'] == null
          ? null
          : readString(json['customer_note']),
    );
  }

  final String orderNumber;
  final String status;
  final double subtotal;
  final List<BillDetailItem> items;
  final String? customerNote;
}

class BillDetail {
  const BillDetail({
    required this.billNumber,
    required this.restaurantName,
    required this.tableNumber,
    required this.status,
    required this.subtotal,
    required this.taxAmount,
    required this.discountAmount,
    required this.totalAmount,
    required this.currency,
    this.receiptToken,
    this.restaurantSlug,
    this.tableCode,
    this.sessionToken,
    this.orders = const [],
    this.generatedAt,
    this.paidAt,
    this.paymentMethod,
    this.paymentReference,
    this.paidByStaffId,
    this.generatedByRole,
    this.sentToCounterByRole,
    this.gstEnabled = false,
    this.invoiceNumber,
    this.invoiceDate,
    this.taxableAmount,
    this.gstRate,
    this.cgstAmount,
    this.sgstAmount,
    this.igstAmount,
    this.gstin,
    this.legalBusinessName,
    this.registeredBillingAddress,
    this.sessionStatus = 'open',
    this.paymentRequestedAt,
    this.detachedAt,
    this.paymentCode,
    this.paymentCodeExpiresAt,
  });

  factory BillDetail.fromJson(Map<String, Object?> json) {
    final rawOrders = json['orders'] as List? ?? const [];
    return BillDetail(
      billNumber: readString(json['bill_number']),
      receiptToken: json['receipt_token'] == null
          ? null
          : readString(json['receipt_token']),
      restaurantName: readString(json['restaurant_name']),
      restaurantSlug: json['restaurant_slug'] == null
          ? null
          : readString(json['restaurant_slug']),
      tableNumber: readString(json['table_number'] ?? json['original_table']),
      tableCode: json['table_code'] == null
          ? null
          : readString(json['table_code']),
      sessionToken: json['session_token'] == null
          ? null
          : readString(json['session_token']),
      status: readString(
        json['status'] ?? json['bill_status'],
        fallback: 'draft',
      ),
      orders: [
        for (final ord in rawOrders)
          if (ord is Map)
            BillDetailOrder.fromJson(Map<String, Object?>.from(ord)),
      ],
      subtotal: readDouble(json['subtotal']),
      taxAmount: readDouble(json['tax_amount']),
      discountAmount: readDouble(json['discount_amount']),
      totalAmount: readDouble(json['total_amount'] ?? json['amount_due']),
      currency: readString(json['currency'], fallback: 'INR'),
      generatedAt: json['generated_at'] == null
          ? (json['issued_at'] == null
                ? null
                : DateTime.tryParse(readString(json['issued_at']))?.toUtc())
          : DateTime.tryParse(readString(json['generated_at']))?.toUtc(),
      paidAt: json['paid_at'] == null
          ? null
          : DateTime.tryParse(readString(json['paid_at']))?.toUtc(),
      paymentMethod: json['payment_method'] == null
          ? null
          : readString(json['payment_method']),
      paymentReference: json['payment_reference'] == null
          ? null
          : readString(json['payment_reference']),
      paidByStaffId: json['paid_by_staff_id'] == null
          ? null
          : readInt(json['paid_by_staff_id']),
      generatedByRole: json['generated_by_role'] == null
          ? null
          : readString(json['generated_by_role']),
      sentToCounterByRole: json['sent_to_counter_by_role'] == null
          ? null
          : readString(json['sent_to_counter_by_role']),
      gstEnabled: json['gst_enabled'] as bool? ?? false,
      invoiceNumber: json['invoice_number'] == null
          ? null
          : readString(json['invoice_number']),
      invoiceDate: json['invoice_date'] == null
          ? null
          : DateTime.tryParse(readString(json['invoice_date']))?.toUtc(),
      taxableAmount: json['taxable_amount'] == null
          ? null
          : readDouble(json['taxable_amount']),
      gstRate: json['gst_rate'] == null ? null : readDouble(json['gst_rate']),
      cgstAmount: json['cgst_amount'] == null
          ? null
          : readDouble(json['cgst_amount']),
      sgstAmount: json['sgst_amount'] == null
          ? null
          : readDouble(json['sgst_amount']),
      igstAmount: json['igst_amount'] == null
          ? null
          : readDouble(json['igst_amount']),
      gstin: json['gstin'] == null ? null : readString(json['gstin']),
      legalBusinessName: json['legal_business_name'] == null
          ? null
          : readString(json['legal_business_name']),
      registeredBillingAddress: json['registered_billing_address'] == null
          ? null
          : readString(json['registered_billing_address']),
      sessionStatus: readString(json['session_status'], fallback: 'open'),
      paymentRequestedAt: json['payment_requested_at'] == null
          ? null
          : DateTime.tryParse(
              readString(json['payment_requested_at']),
            )?.toUtc(),
      detachedAt: json['detached_at'] == null
          ? null
          : DateTime.tryParse(readString(json['detached_at']))?.toUtc(),
      paymentCode: json['payment_code'] == null
          ? null
          : readString(json['payment_code']),
      paymentCodeExpiresAt: json['payment_code_expires_at'] == null
          ? null
          : DateTime.tryParse(
              readString(json['payment_code_expires_at']),
            )?.toUtc(),
    );
  }

  final String billNumber;
  final String? receiptToken;
  final String restaurantName;
  final String? restaurantSlug;
  final String tableNumber;
  final String? tableCode;
  final String? sessionToken;
  final String status;
  final List<BillDetailOrder> orders;
  final double subtotal;
  final double taxAmount;
  final double discountAmount;
  final double totalAmount;
  final String currency;
  final DateTime? generatedAt;
  final DateTime? paidAt;
  final String? paymentMethod;
  final String? paymentReference;
  final int? paidByStaffId;
  final String? generatedByRole;
  final String? sentToCounterByRole;
  final bool gstEnabled;
  final String? invoiceNumber;
  final DateTime? invoiceDate;
  final double? taxableAmount;
  final double? gstRate;
  final double? cgstAmount;
  final double? sgstAmount;
  final double? igstAmount;
  final String? gstin;
  final String? legalBusinessName;
  final String? registeredBillingAddress;
  final String sessionStatus;
  final DateTime? paymentRequestedAt;
  final DateTime? detachedAt;
  final String? paymentCode;
  final DateTime? paymentCodeExpiresAt;

  bool get isPaid => status == 'paid';
  bool get isPaymentPending => status == 'payment_pending';
  bool get isDetached => sessionStatus == 'detached_awaiting_payment';

  bool get isCodeExpired {
    if (paymentCodeExpiresAt == null) return false;
    return DateTime.now().toUtc().isAfter(paymentCodeExpiresAt!);
  }
}
