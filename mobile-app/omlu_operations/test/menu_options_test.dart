import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/features/staff/cart_provider.dart';

void main() {
  test('same option combination merges and different combinations stay separate', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final cart = container.read(cartProvider.notifier);
    const quarter = [
      MenuOptionSelection(groupId: 7, optionId: 70),
    ];
    const half = [
      MenuOptionSelection(groupId: 7, optionId: 71),
    ];

    cart.addItem(10, selectedOptions: quarter);
    cart.addItem(10, selectedOptions: quarter);
    cart.addItem(10, selectedOptions: half);

    final lines = container.read(cartProvider).items.values.toList();
    expect(lines, hasLength(2));
    expect(
      lines.firstWhere(
        (line) => line.selectedOptions.single.optionId == 70,
      ).quantity,
      2,
    );
    expect(
      lines.firstWhere(
        (line) => line.selectedOptions.single.optionId == 71,
      ).quantity,
      1,
    );
  });

  test('selected options are retained in the canonical order draft payload', () {
    const line = CartItem(
      menuItemId: 10,
      quantity: 2,
      selectedOptions: [
        MenuOptionSelection(groupId: 7, optionId: 71),
      ],
    );
    final draft = OrderItemDraft(
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      selectedOptions: line.selectedOptions,
    ).toJson();

    expect(draft['selected_options'], [
      {'group_id': 7, 'option_id': 71, 'quantity': 1},
    ]);
  });
}
