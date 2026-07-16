import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_button.dart';
import 'cart_provider.dart';
import 'menu_provider.dart';
import 'tables_provider.dart';
import 'staff_shell.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartState = ref.watch(cartProvider);
    final tableId = cartState.tableId;

    if (tableId == null || cartState.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart', style: OmluTypography.h2)),
        body: const Center(child: Text('Your cart is empty.')),
      );
    }

    final menuState = ref.watch(menuCategoriesProvider(tableId));
    final tables = ref.read(tablesProvider).value;
    final tableNumber =
        tables?.firstWhere((t) => t.id == tableId).tableNumber ??
        'Table $tableId';

    return Scaffold(
      appBar: AppBar(
        title: Text('Cart - $tableNumber', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: menuState.when(
        data: (categories) {
          // Flat map all items in categories to search by ID
          final allMenuItems = {
            for (final cat in categories)
              for (final item in cat.items) item.id: item,
          };

          double totalAmount = 0;
          final List<Widget> itemRows = [];

          cartState.items.forEach((itemId, cartItem) {
            final menuItem = allMenuItems[itemId];
            if (menuItem == null) return;

            final price = menuItem.price;
            final subtotal = price * cartItem.quantity;
            totalAmount += subtotal;

            itemRows.add(
              _CartItemRow(
                menuItem: menuItem,
                cartItem: cartItem,
                subtotal: subtotal,
              ),
            );
          });

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(OmluSpacing.md),
                  children: [
                    ...itemRows,
                    const SizedBox(height: OmluSpacing.md),

                    // Summary Card
                    OmluCard(
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Total Amount',
                                style: OmluTypography.h3,
                              ),
                              Text(
                                '₹${totalAmount.toStringAsFixed(2)}',
                                style: OmluTypography.h2.copyWith(
                                  color: OmluColors.accent,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: OmluSpacing.md),

                    if (cartState.submissionState == SubmissionState.error)
                      Container(
                        padding: const EdgeInsets.all(OmluSpacing.md),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: OmluRadius.borderMd,
                          border: Border.all(color: Colors.red.shade200),
                        ),
                        child: Text(
                          cartState.errorMessage ?? 'Submission failed.',
                          style: OmluTypography.bodySmall.copyWith(
                            color: Colors.red.shade900,
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // Bottom Actions
              Container(
                padding: const EdgeInsets.all(OmluSpacing.md),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 10,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  child: OmluButton(
                    text: 'Send Order',
                    isLoading:
                        cartState.submissionState == SubmissionState.submitting,
                    onPressed:
                        cartState.submissionState == SubmissionState.submitting
                        ? null
                        : () async {
                            try {
                              await ref
                                  .read(cartProvider.notifier)
                                  .submitOrder();
                              if (context.mounted) {
                                // Show success dialog/snack and return to table view
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Order sent successfully!'),
                                    backgroundColor: OmluColors.statusAvailable,
                                  ),
                                );
                                ref.read(cartProvider.notifier).clearAll();
                                ref
                                        .read(selectedTableIdProvider.notifier)
                                        .state =
                                    null;
                                ref.read(staffTabProvider.notifier).state =
                                    0; // Return to active tables
                                Navigator.of(context).pop();
                              }
                            } catch (_) {
                              // Error handled by provider state, retry remains possible with same key
                            }
                          },
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) =>
            Center(child: Text('Error loading menu details: $err')),
      ),
    );
  }
}

class _CartItemRow extends ConsumerWidget {
  const _CartItemRow({
    required this.menuItem,
    required this.cartItem,
    required this.subtotal,
  });

  final MenuItem menuItem;
  final CartItem cartItem;
  final double subtotal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: OmluSpacing.md),
      child: OmluCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(menuItem.name, style: OmluTypography.h3),
                      const SizedBox(height: OmluSpacing.xxs),
                      Text(
                        '₹${menuItem.price} each',
                        style: OmluTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: OmluSpacing.md),
                Text(
                  '₹${subtotal.toStringAsFixed(2)}',
                  style: OmluTypography.bodyLarge.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: OmluSpacing.md),
            Row(
              children: [
                // Item Note input
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Add note (e.g. less spice)',
                      hintStyle: OmluTypography.bodySmall,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: OmluRadius.borderSm,
                        borderSide: const BorderSide(color: OmluColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: OmluRadius.borderSm,
                        borderSide: const BorderSide(color: OmluColors.accent),
                      ),
                    ),
                    style: OmluTypography.bodyMedium,
                    controller: TextEditingController(text: cartItem.note)
                      ..selection = TextSelection.collapsed(
                        offset: cartItem.note?.length ?? 0,
                      ),
                    onChanged: (val) {
                      ref
                          .read(cartProvider.notifier)
                          .updateItemNote(menuItem.id, val);
                    },
                  ),
                ),
                const SizedBox(width: OmluSpacing.md),

                // Quantity plus/minus
                Row(
                  children: [
                    _CartQtyBtn(
                      icon: Icons.remove_rounded,
                      onPressed: () => ref
                          .read(cartProvider.notifier)
                          .removeItem(menuItem.id),
                    ),
                    SizedBox(
                      width: 32,
                      child: Text(
                        '${cartItem.quantity}',
                        style: OmluTypography.bodyMedium.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    _CartQtyBtn(
                      icon: Icons.add_rounded,
                      onPressed: () =>
                          ref.read(cartProvider.notifier).addItem(menuItem.id),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CartQtyBtn extends StatelessWidget {
  const _CartQtyBtn({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: OmluColors.border.withValues(alpha: 0.5),
      borderRadius: OmluRadius.borderSm,
      child: InkWell(
        onTap: onPressed,
        borderRadius: OmluRadius.borderSm,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(icon, size: 18, color: OmluColors.textPrimary),
        ),
      ),
    );
  }
}
