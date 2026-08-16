import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/models/operations_models.dart';

Map<String, Object?> item({String status = 'active', int quantity = 2}) => {
  'id': 11,
  'item_name': 'Masala dosa',
  'quantity': quantity,
  'cancellation_status': status,
  'cancellation_reason': status == 'cancelled' ? 'Customer changed mind' : null,
  'cancelled_at': status == 'cancelled' ? '2026-08-17T00:00:00Z' : null,
  'cancellation_actor_type': status == 'cancelled' ? 'staff' : null,
};

KitchenOrder order(String status, List<Map<String, Object?>> items) =>
    KitchenOrder.fromJson({
      'order_number': 'O-1',
      'public_token': 'token',
      'table_number': '4',
      'status': status,
      'subtotal': '100.00',
      'created_at': '2026-08-17T00:00:00Z',
      'items': items,
    });

void main() {
  test('active item remains actionable', () {
    final parsed = KitchenOrderItem.fromJson(item());
    expect(parsed.isCancelled, isFalse);
    expect(parsed.actionableQuantity, 2);
  });

  test('cancelled pending and accepted items are not actionable', () {
    for (final status in ['pending', 'accepted']) {
      final parsed = order(status, [item(status: 'cancelled')]);
      expect(parsed.items.single.isCancelled, isTrue);
      expect(parsed.actionableQuantity, 0);
      expect(parsed.hasActionableItems, isFalse);
    }
  });

  test('mixed order counts only active quantities', () {
    final parsed = order('accepted', [
      item(quantity: 3),
      item(status: 'cancelled', quantity: 4),
    ]);
    expect(parsed.actionableQuantity, 3);
  });

  test('realtime cancellation is immediate and duplicate-safe', () {
    final initial = order('accepted', [item(quantity: 3)]);
    final event = <String, Object?>{
      'order_public_token': 'token',
      'order_item_id': 11,
      'cancellation_reason': 'Item unavailable',
      'cancellation_actor_type': 'staff',
      'cancelled_at': '2026-08-17T00:01:00Z',
      'order_status': 'rejected',
      'order_subtotal': '0.00',
    };
    final once = initial.applyItemCancellation(event);
    final twice = once.applyItemCancellation(event);
    expect(once.items.single.isCancelled, isTrue);
    expect(once.actionableQuantity, 0);
    expect(once.status, 'rejected');
    expect(identical(once.items.single, twice.items.single), isTrue);
  });

  testWidgets('cancelled treatment uses strike-through and badge', (
    tester,
  ) async {
    final parsed = KitchenOrderItem.fromJson(item(status: 'cancelled'));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              Text(
                parsed.name,
                style: TextStyle(
                  decoration: parsed.isCancelled
                      ? TextDecoration.lineThrough
                      : null,
                ),
              ),
              if (parsed.isCancelled) const Chip(label: Text('Cancelled')),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Cancelled'), findsOneWidget);
    expect(
      tester.widget<Text>(find.text('Masala dosa')).style?.decoration,
      TextDecoration.lineThrough,
    );
  });
}
