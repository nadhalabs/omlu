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
  });

  factory StaffTableSummary.fromJson(Map<String, Object?> json) {
    return StaffTableSummary(
      id: readRequiredId(json['id'], 'id'),
      tableNumber: readString(json['table_number']),
      state: readString(json['state'], fallback: 'available'),
      hasOpenSession: json['has_open_session'] as bool? ?? false,
      sessionToken: json['session_token'] == null
          ? null
          : readString(json['session_token']),
      sessionStatus: json['session_status'] == null
          ? null
          : readString(json['session_status']),
      activeOrderCount: readInt(json['active_order_count']),
      currentBillAmount: readDouble(json['current_bill_amount']),
      openedMinutesAgo: json['opened_minutes_ago'] == null
          ? null
          : readInt(json['opened_minutes_ago']),
      attention: [
        for (final value in (json['attention'] as List? ?? const []))
          readString(value),
      ],
      billRequested: json['bill_requested'] as bool? ?? false,
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
