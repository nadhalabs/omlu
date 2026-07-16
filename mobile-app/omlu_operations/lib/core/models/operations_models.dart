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
      id: json['id'] as int,
      tableNumber: json['table_number'] as String? ?? '',
      state: json['state'] as String? ?? 'available',
      hasOpenSession: json['has_open_session'] as bool? ?? false,
      sessionToken: json['session_token'] as String?,
      sessionStatus: json['session_status'] as String?,
      activeOrderCount: json['active_order_count'] as int? ?? 0,
      currentBillAmount: json['current_bill_amount'] as String? ?? '0.00',
      openedMinutesAgo: json['opened_minutes_ago'] as int?,
      attention: [
        for (final value in (json['attention'] as List? ?? const []))
          value.toString(),
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
  final String currentBillAmount;
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
      orderNumber: json['order_number'] as String? ?? '',
      publicToken: json['public_token'] as String? ?? '',
      status: json['status'] as String? ?? '',
      subtotal: json['subtotal'] as String? ?? '0.00',
      diningSessionToken: json['dining_session_token'] as String?,
    );
  }

  final String orderNumber;
  final String publicToken;
  final String status;
  final String subtotal;
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
      name: json['name'] as String? ?? json['menu_item_name'] as String? ?? '',
      quantity: json['quantity'] as int? ?? 1,
      note: json['note'] as String? ?? json['item_note'] as String?,
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
      orderNumber: json['order_number'] as String? ?? '',
      publicToken: json['public_token'] as String? ?? '',
      tableNumber: json['table_number'] as String? ?? '',
      status: json['status'] as String? ?? '',
      subtotal: json['subtotal'] as String? ?? '0.00',
      createdAt: DateTime.parse(json['created_at'] as String),
      items: [
        for (final item in rawItems)
          KitchenOrderItem.fromJson(Map<String, Object?>.from(item as Map)),
      ],
      customerNote: json['customer_note'] as String?,
    );
  }

  final String orderNumber;
  final String publicToken;
  final String tableNumber;
  final String status;
  final String subtotal;
  final DateTime createdAt;
  final List<KitchenOrderItem> items;
  final String? customerNote;
}
