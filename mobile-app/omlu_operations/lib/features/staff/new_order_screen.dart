import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app/router.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_skeleton_loader.dart';
import 'tables_provider.dart';
import 'menu_provider.dart';
import 'cart_provider.dart';
import 'cart_screen.dart';
import '../../core/models/operations_models.dart';
import '../auth_provider.dart';

class NewOrderScreen extends ConsumerStatefulWidget {
  const NewOrderScreen({super.key});

  @override
  ConsumerState<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends ConsumerState<NewOrderScreen> {
  int _selectedCategoryId = -1; // -1 for "All"
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selectedTableId = ref.watch(selectedTableIdProvider);

    if (selectedTableId == null) {
      return const _TablePickerView();
    }

    return _OrderMenuView(
      tableId: selectedTableId,
      selectedCategoryId: _selectedCategoryId,
      searchQuery: _searchQuery,
      searchController: _searchController,
      onCategoryChanged: (id) {
        setState(() {
          _selectedCategoryId = id;
        });
      },
      onSearchChanged: (query) {
        setState(() {
          _searchQuery = query;
        });
      },
    );
  }
}

class _TablePickerView extends ConsumerWidget {
  const _TablePickerView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesState = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Select a Table', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      body: tablesState.when(
        data: (tables) {
          if (tables.isEmpty) {
            return const Center(child: Text('No tables available.'));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(OmluSpacing.md),
            itemCount: tables.length,
            separatorBuilder: (context, index) =>
                const SizedBox(height: OmluSpacing.md),
            itemBuilder: (context, index) {
              final table = tables[index];
              final isOccupied =
                  table.state == 'occupied' || table.hasOpenSession;

              return OmluCard(
                onTap: () {
                  ref.read(selectedTableIdProvider.notifier).state = table.id;
                  ref
                      .read(cartProvider.notifier)
                      .setTable(table.id, table.tableNumber);
                },
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(table.tableNumber, style: OmluTypography.h2),
                        const SizedBox(height: OmluSpacing.xxs),
                        Text(
                          isOccupied
                              ? 'Occupied (Current Session)'
                              : 'Available',
                          style: OmluTypography.bodyMedium.copyWith(
                            color: isOccupied
                                ? OmluColors.statusNeedsBill
                                : OmluColors.statusAvailable,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const Icon(
                      Icons.arrow_forward_ios_rounded,
                      size: 20,
                      color: OmluColors.textSecondary,
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(OmluSpacing.md),
          itemCount: 5,
          itemBuilder: (context, index) => const Padding(
            padding: EdgeInsets.only(bottom: OmluSpacing.md),
            child: OmluSkeletonLoader(width: double.infinity, height: 72),
          ),
        ),
        error: (err, st) => Center(child: Text('Error loading tables: $err')),
      ),
    );
  }
}

class _OrderMenuView extends ConsumerWidget {
  const _OrderMenuView({
    required this.tableId,
    required this.selectedCategoryId,
    required this.searchQuery,
    required this.searchController,
    required this.onCategoryChanged,
    required this.onSearchChanged,
  });

  final int tableId;
  final int selectedCategoryId;
  final String searchQuery;
  final TextEditingController searchController;
  final ValueChanged<int> onCategoryChanged;
  final ValueChanged<String> onSearchChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menuState = ref.watch(menuCategoriesProvider(tableId));
    final cartState = ref.watch(cartProvider);

    // Fetch table number
    final tables = ref.read(tablesProvider).value;
    final tableNumber =
        tables?.firstWhere((t) => t.id == tableId).tableNumber ??
        'Table $tableId';

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: OmluColors.textPrimary,
          ),
          onPressed: () {
            ref.read(selectedTableIdProvider.notifier).state = null;
          },
        ),
        title: Text('New Order: $tableNumber', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Search box
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: OmluSpacing.md),
            child: TextField(
              controller: searchController,
              onChanged: onSearchChanged,
              style: OmluTypography.bodyLarge,
              decoration: InputDecoration(
                hintText: 'Search menu items...',
                prefixIcon: const Icon(
                  Icons.search_rounded,
                  color: OmluColors.textSecondary,
                ),
                suffixIcon: searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded),
                        onPressed: () {
                          searchController.clear();
                          onSearchChanged('');
                        },
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                filled: true,
                fillColor: Colors.white,
                enabledBorder: OutlineInputBorder(
                  borderRadius: OmluRadius.borderMd,
                  borderSide: const BorderSide(color: OmluColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: OmluRadius.borderMd,
                  borderSide: const BorderSide(color: OmluColors.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: OmluSpacing.md),

          // Menu Category Chips
          menuState.when(
            data: (categories) {
              return SizedBox(
                height: 44,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: OmluSpacing.md,
                  ),
                  itemCount: categories.length + 1,
                  separatorBuilder: (context, index) =>
                      const SizedBox(width: OmluSpacing.xs),
                  itemBuilder: (context, index) {
                    final isAll = index == 0;
                    final catId = isAll ? -1 : categories[index - 1].id;
                    final catName = isAll ? 'All' : categories[index - 1].name;
                    final isSelected = selectedCategoryId == catId;

                    return ChoiceChip(
                      label: Text(catName),
                      selected: isSelected,
                      onSelected: (_) => onCategoryChanged(catId),
                      selectedColor: OmluColors.accent,
                      backgroundColor: Colors.white,
                      labelStyle: OmluTypography.bodyMedium.copyWith(
                        color: isSelected
                            ? Colors.white
                            : OmluColors.textPrimary,
                        fontWeight: isSelected
                            ? FontWeight.bold
                            : FontWeight.normal,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: OmluRadius.borderCircular,
                        side: BorderSide(
                          color: isSelected
                              ? OmluColors.accent
                              : OmluColors.border,
                        ),
                      ),
                      showCheckmark: false,
                    );
                  },
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (err, st) => const SizedBox.shrink(),
          ),
          const SizedBox(height: OmluSpacing.md),

          // Menu Items List
          Expanded(
            child: menuState.when(
              data: (categories) {
                // Filter items
                final List<MenuItem> items = [];
                for (final cat in categories) {
                  if (selectedCategoryId == -1 ||
                      cat.id == selectedCategoryId) {
                    items.addAll(cat.items);
                  }
                }

                final filteredItems = items.where((item) {
                  return item.name.toLowerCase().contains(
                    searchQuery.toLowerCase(),
                  );
                }).toList();

                if (filteredItems.isEmpty) {
                  return const Center(
                    child: Text('No items match your search.'),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(
                    OmluSpacing.md,
                    0,
                    OmluSpacing.md,
                    100,
                  ),
                  itemCount: filteredItems.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: OmluSpacing.md),
                  itemBuilder: (context, index) {
                    final item = filteredItems[index];
                    final cartItem = cartState.items[item.id];
                    final quantity = cartItem?.quantity ?? 0;

                    return OmluCard(
                      child: Row(
                        children: [
                          // Item Details
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.name, style: OmluTypography.h3),
                                if (item.description != null &&
                                    item.description!.isNotEmpty) ...[
                                  const SizedBox(height: OmluSpacing.xxs),
                                  Text(
                                    item.description!,
                                    style: OmluTypography.bodySmall,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                                const SizedBox(height: OmluSpacing.xs),
                                Text(
                                  '₹${item.price}',
                                  style: OmluTypography.bodyLarge.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: OmluColors.accent,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: OmluSpacing.md),

                          // Quantity Controls
                          if (quantity > 0)
                            Row(
                              children: [
                                _QuantityButton(
                                  icon: Icons.remove_rounded,
                                  onPressed: () => ref
                                      .read(cartProvider.notifier)
                                      .removeItem(item.id),
                                ),
                                SizedBox(
                                  width: 32,
                                  child: Text(
                                    '$quantity',
                                    style: OmluTypography.bodyLarge.copyWith(
                                      fontWeight: FontWeight.bold,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                                _QuantityButton(
                                  icon: Icons.add_rounded,
                                  onPressed: () => ref
                                      .read(cartProvider.notifier)
                                      .addItem(item.id),
                                ),
                              ],
                            )
                          else
                            ElevatedButton(
                              onPressed: item.isAvailable
                                  ? () => ref
                                        .read(cartProvider.notifier)
                                        .addItem(item.id)
                                  : null,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: OmluColors.accent,
                                foregroundColor: Colors.white,
                                disabledBackgroundColor: Colors.grey.shade300,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: OmluRadius.borderMd,
                                ),
                                minimumSize: const Size(60, 44),
                              ),
                              child: Text(item.isAvailable ? 'Add' : 'Out'),
                            ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => ListView.builder(
                padding: const EdgeInsets.all(OmluSpacing.md),
                itemCount: 4,
                itemBuilder: (context, index) => const Padding(
                  padding: EdgeInsets.only(bottom: OmluSpacing.md),
                  child: OmluSkeletonLoader(width: double.infinity, height: 96),
                ),
              ),
              error: (err, st) =>
                  Center(child: Text('Error loading menu: $err')),
            ),
          ),
          _BillingStatusCardView(tableId: tableId),
        ],
      ),
      // Floating Bottom Cart Bar
      bottomSheet: cartState.isEmpty
          ? null
          : Container(
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
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${cartState.items.values.fold(0, (sum, item) => sum + item.quantity)} Items selected',
                          style: OmluTypography.bodyMedium.copyWith(
                            color: OmluColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: OmluSpacing.xxs),
                        const Text(
                          'Ready to submit',
                          style: OmluTypography.bodySmall,
                        ),
                      ],
                    ),
                    const SizedBox(width: OmluSpacing.md),
                    OmluButton(
                      text: 'View Order',
                      isFullWidth: false,
                      onPressed: () {
                        OmluRouter.push(context, const CartScreen());
                      },
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _QuantityButton extends StatelessWidget {
  const _QuantityButton({required this.icon, required this.onPressed});
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
          width: 44, // 48 is touch target, padded is fine
          height: 44,
          child: Icon(icon, size: 20, color: OmluColors.textPrimary),
        ),
      ),
    );
  }
}

class _BillingStatusCardView extends ConsumerWidget {
  const _BillingStatusCardView({required this.tableId});
  final int tableId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(tableDetailProvider(tableId));

    return detailAsync.when(
      data: (detail) {
        final table = StaffTableSummary.fromDetailJson(detail);
        return Padding(
          padding: const EdgeInsets.all(OmluSpacing.md),
          child: _BillingStatusCard(table: table),
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.all(OmluSpacing.md),
        child: OmluSkeletonLoader(width: double.infinity, height: 80),
      ),
      error: (err, st) => const SizedBox.shrink(),
    );
  }
}

class _BillingStatusCard extends ConsumerStatefulWidget {
  const _BillingStatusCard({required this.table});
  final StaffTableSummary table;

  @override
  ConsumerState<_BillingStatusCard> createState() => _BillingStatusCardState();
}

class _BillingStatusCardState extends ConsumerState<_BillingStatusCard> {
  bool _submitting = false;

  Future<void> _handleRequestBill() async {
    setState(() {
      _submitting = true;
    });

    try {
      final api = ref.read(operationsApiProvider);
      await api.requestTableBill(widget.table.id);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Bill request submitted successfully!'),
            backgroundColor: OmluColors.statusAvailable,
          ),
        );
      }
      ref.invalidate(tableDetailProvider(widget.table.id));
      await ref.read(tablesProvider.notifier).fetchTables();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final table = widget.table;

    // session closed or bill paid → show nothing
    final isClosedOrPaid = !table.hasOpenSession ||
        table.sessionStatus == 'closed' ||
        table.billStatus == 'paid';

    if (isClosedOrPaid) {
      return const SizedBox.shrink();
    }

    // bill exists → Bill Issued
    final billExists = table.billNumber != null || table.billStatus != null || table.billId != null;
    if (billExists) {
      return OmluCard(
        color: OmluColors.statusReady.withValues(alpha: 0.1),
        borderColor: OmluColors.statusReady.withValues(alpha: 0.3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Bill Issued',
              style: OmluTypography.h3.copyWith(color: OmluColors.statusReady),
            ),
            if (table.billNumber != null) ...[
              const SizedBox(height: OmluSpacing.xxs),
              Text(
                'Bill: ${table.billNumber}',
                style: OmluTypography.bodyMedium,
              ),
            ],
          ],
        ),
      );
    }

    // active bill request exists → Waiting for owner/admin
    if (table.hasActiveBillRequest) {
      return OmluCard(
        color: OmluColors.statusNeedsBill.withValues(alpha: 0.1),
        borderColor: OmluColors.statusNeedsBill.withValues(alpha: 0.3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Bill requested',
              style: OmluTypography.h3.copyWith(color: OmluColors.statusNeedsBill),
            ),
            const SizedBox(height: OmluSpacing.xxs),
            const Text(
              'Waiting for owner/admin',
              style: OmluTypography.bodyMedium,
            ),
          ],
        ),
      );
    }

    // active session + orders → Request Bill
    if (table.hasOpenSession && table.activeOrderCount > 0) {
      return OmluCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Table billing',
              style: OmluTypography.h3,
            ),
            const SizedBox(height: OmluSpacing.xs),
            OmluButton(
              text: 'Request Bill',
              isLoading: _submitting,
              onPressed: _submitting ? null : _handleRequestBill,
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
