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
    );
  }

  factory StaffTableSummary.fromDetailJson(Map<String, Object?> json) {
    final tableMap = json['table'] as Map<String, Object?>? ?? const {};
    final sessionMap = json['session'] as Map<String, Object?>?;
    final billMap = sessionMap != null ? (sessionMap['bill'] as Map<String, Object?>?) : null;

    final id = readRequiredId(tableMap['id'] ?? json['id'], 'id');
    final tableNumber = readString(tableMap['table_number'] ?? json['table_number']);
    final state = readString(tableMap['state'] ?? json['state'], fallback: 'available');
    final hasOpenSession = tableMap['has_open_session'] as bool? ?? (sessionMap != null);
    
    final sessionToken = tableMap['session_token'] != null
        ? readString(tableMap['session_token'])
        : (sessionMap != null && sessionMap['session_token'] != null
            ? readString(sessionMap['session_token'])
            : (json['session_token'] != null ? readString(json['session_token']) : null));
                         
    final sessionStatus = tableMap['session_status'] != null
        ? readString(tableMap['session_status'])
        : (sessionMap != null && sessionMap['status'] != null
            ? readString(sessionMap['status'])
            : (json['session_status'] != null
                ? readString(json['session_status'])
                : (json['status'] != null ? readString(json['status']) : null)));

    final activeOrderCount = tableMap['active_order_count'] != null
        ? readInt(tableMap['active_order_count'])
        : (sessionMap != null
            ? (sessionMap['orders'] as List?)?.length ?? 0
            : 0);
                             
    final currentBillAmount = readDouble(tableMap['current_bill_amount'] ?? json['current_bill_amount']);
    
    final openedMinutesAgo = tableMap['opened_minutes_ago'] != null
        ? readInt(tableMap['opened_minutes_ago'])
        : (json['opened_minutes_ago'] != null
            ? readInt(json['opened_minutes_ago'])
            : null);

    final attention = [
      for (final value in (tableMap['attention'] as List? ?? json['attention'] as List? ?? const []))
        readString(value),
    ];
    final billRequested = tableMap['bill_requested'] as bool? ?? json['bill_requested'] as bool? ?? false;

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
    final hasPendingBillRequest = requestsList != null && requestsList.any((req) {
      if (req is Map) {
        return readString(req['request_type']) == 'bill' &&
               readString(req['status']) == 'pending';
      }
      return false;
    });
    final hasActiveBillRequest = billRequested || attention.contains('bill') || hasPendingBillRequest;

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
    required this.name,
    required this.quantity,
    this.note,
  });

  factory KitchenOrderItem.fromJson(Map<String, Object?> json) {
    return KitchenOrderItem(
      name: readString(json['name'] ?? json['menu_item_name']),
      quantity: readInt(json['quantity'], fallback: 1),
      note: json['note'] == null ? null : readString(json['note']),
    );
  }

  final String name;
  final int quantity;
  final String? note;
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
}
