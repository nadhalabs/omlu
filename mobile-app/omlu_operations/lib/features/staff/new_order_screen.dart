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
import '../../design_system/widgets/realtime_status_chip.dart';
import 'tables_provider.dart';
import 'menu_provider.dart';
import 'cart_provider.dart';
import 'cart_screen.dart';
import '../../core/models/operations_models.dart';
import '../../core/models/role_session.dart';
import '../../core/api/api_exceptions.dart';
import '../../core/errors/user_facing_error.dart';
import 'staff_bill_screen.dart';
import '../auth_provider.dart';
import 'staff_access_provider.dart';

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
        title: const Text(
          'OMLU Staff · Select Table',
          style: OmluTypography.h2,
        ),
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
                  final authoritativeSlug = ref
                      .read(authProvider)
                      .valueOrNull
                      ?.restaurantSlug;
                  if (authoritativeSlug == null || authoritativeSlug.isEmpty) {
                    return;
                  }
                  ref.read(cartProvider.notifier).setTable(table.id);
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
        error: (err, st) => Center(child: Text(userFacingError(err))),
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
    final menuState = ref.watch(menuViewProvider(tableId));
    final cartState = ref.watch(cartProvider);

    // Fetch table number
    final tables = ref.read(tablesProvider).value;
    var tableNumber = 'Table $tableId';
    for (final table in tables ?? const <StaffTableSummary>[]) {
      if (table.id == tableId) {
        tableNumber = table.tableNumber;
        break;
      }
    }

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
        title: Text('Staff · $tableNumber', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: const [RealtimeStatusChip()],
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
            data: (menu) {
              final categories = menu.categories;
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
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(horizontal: OmluSpacing.md),
              child: OmluSkeletonLoader(width: double.infinity, height: 44),
            ),
            error: (err, st) => const Padding(
              padding: EdgeInsets.symmetric(horizontal: OmluSpacing.md),
              child: Text('Menu could not be loaded.'),
            ),
          ),
          const SizedBox(height: OmluSpacing.md),
          if (menuState.valueOrNull?.refreshWarning == true)
            const Padding(
              padding: EdgeInsets.fromLTRB(
                OmluSpacing.md,
                0,
                OmluSpacing.md,
                OmluSpacing.sm,
              ),
              child: Text(
                'Showing saved menu. Refresh failed.',
                style: TextStyle(color: OmluColors.statusNeedsBill),
              ),
            ),

          // Menu Items List
          Expanded(
            child: menuState.when(
              data: (menu) {
                final categories = menu.categories;
                final categoryStillExists =
                    selectedCategoryId == -1 ||
                    categories.any(
                      (category) => category.id == selectedCategoryId,
                    );
                final effectiveCategoryId = categoryStillExists
                    ? selectedCategoryId
                    : -1;
                if (!categoryStillExists) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    onCategoryChanged(-1);
                  });
                }
                // Filter items
                final List<MenuItem> items = [];
                for (final cat in categories) {
                  if (effectiveCategoryId == -1 ||
                      cat.id == effectiveCategoryId) {
                    items.addAll(cat.items);
                  }
                }

                final filteredItems = items.where((item) {
                  return item.name.toLowerCase().contains(
                    searchQuery.toLowerCase(),
                  );
                }).toList();

                if (filteredItems.isEmpty) {
                  return Center(
                    child: Text(
                      categories.isEmpty
                          ? 'No menu items have been added yet.'
                          : searchQuery.isNotEmpty
                          ? 'No items match your search.'
                          : 'No menu items have been added yet.',
                    ),
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
                    final quantity = cartState.items.values
                        .where((line) => line.menuItemId == item.id)
                        .fold<int>(0, (total, line) => total + line.quantity);
                    final configurable = item.optionGroups.isNotEmpty;

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
                          if (quantity > 0 && !configurable)
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
                                  ? () async {
                                      if (!configurable) {
                                        ref
                                            .read(cartProvider.notifier)
                                            .addItem(item.id);
                                        return;
                                      }
                                      final selections =
                                          await showModalBottomSheet<
                                            List<MenuOptionSelection>
                                          >(
                                            context: context,
                                            isScrollControlled: true,
                                            builder: (_) =>
                                                _MenuOptionSelector(item: item),
                                          );
                                      if (selections != null &&
                                          context.mounted) {
                                        ref
                                            .read(cartProvider.notifier)
                                            .addItem(
                                              item.id,
                                              selectedOptions: selections,
                                            );
                                      }
                                    }
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
                              child: Text(
                                item.isAvailable
                                    ? configurable
                                          ? 'Choose'
                                          : 'Add'
                                    : 'Out',
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => Column(
                children: [
                  const Text('Loading menu…'),
                  const SizedBox(height: OmluSpacing.sm),
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(OmluSpacing.md),
                      itemCount: 4,
                      itemBuilder: (context, index) => const Padding(
                        padding: EdgeInsets.only(bottom: OmluSpacing.md),
                        child: OmluSkeletonLoader(
                          width: double.infinity,
                          height: 96,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              error: (err, st) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Menu could not be loaded.'),
                    const SizedBox(height: OmluSpacing.sm),
                    OmluButton(
                      text: 'Retry',
                      onPressed: () =>
                          ref.read(menuViewProvider(tableId).notifier).retry(),
                    ),
                  ],
                ),
              ),
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

class _MenuOptionSelector extends StatefulWidget {
  const _MenuOptionSelector({required this.item});
  final MenuItem item;

  @override
  State<_MenuOptionSelector> createState() => _MenuOptionSelectorState();
}

class _MenuOptionSelectorState extends State<_MenuOptionSelector> {
  final Map<int, MenuOptionSelection> _selected = {};
  bool _showErrors = false;

  List<MenuOptionSelection> get _values => _selected.values.toList();

  int _count(MenuOptionGroup group) => _values
      .where((selection) => selection.groupId == group.id)
      .fold(0, (total, selection) => total + selection.quantity);

  bool _valid(MenuOptionGroup group) {
    final count = _count(group);
    return count >= group.effectiveMinimum &&
        (group.maximumSelections == 0 || count <= group.maximumSelections);
  }

  void _toggle(MenuOptionGroup group, MenuOptionValue option) {
    setState(() {
      if (_selected.containsKey(option.id)) {
        _selected.remove(option.id);
        return;
      }
      if (group.isSingleSelect) {
        _selected.removeWhere((_, value) => value.groupId == group.id);
      } else if (group.maximumSelections > 0 &&
          _count(group) >= group.maximumSelections) {
        return;
      }
      _selected[option.id] = MenuOptionSelection(
        groupId: group.id,
        optionId: option.id,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final groups = [...widget.item.optionGroups]
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    final valid = groups.every(_valid);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          OmluSpacing.md,
          OmluSpacing.md,
          OmluSpacing.md,
          MediaQuery.viewInsetsOf(context).bottom + OmluSpacing.md,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(widget.item.name, style: OmluTypography.h2),
              Text(
                'Base price: ₹${widget.item.price.toStringAsFixed(2)}',
                style: OmluTypography.bodyMedium,
              ),
              const SizedBox(height: OmluSpacing.md),
              for (final group in groups) ...[
                Text(group.name, style: OmluTypography.h3),
                Text(
                  '${group.required ? 'Required' : 'Optional'} · ${group.maximumSelections == 1 ? 'Choose ${group.effectiveMinimum == 0 ? 'up to ' : ''}1' : 'Choose ${group.effectiveMinimum}–${group.maximumSelections == 0 ? 'any' : group.maximumSelections}'}',
                  style: OmluTypography.bodySmall.copyWith(
                    color: _showErrors && !_valid(group)
                        ? Colors.red
                        : OmluColors.textSecondary,
                  ),
                ),
                const SizedBox(height: OmluSpacing.xs),
                for (final option in [
                  ...group.options,
                ]..sort((a, b) => a.displayOrder.compareTo(b.displayOrder)))
                  if (option.available)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _selected.containsKey(option.id),
                      controlAffinity: ListTileControlAffinity.leading,
                      title: Text(option.name),
                      subtitle: Text(
                        group.type == 'variant'
                            ? 'Final price ₹${option.priceEffect.toStringAsFixed(2)}'
                            : option.priceEffect == 0
                            ? 'No extra charge'
                            : 'Adds ₹${option.priceEffect.toStringAsFixed(2)}',
                      ),
                      onChanged: (_) => _toggle(group, option),
                    ),
                const SizedBox(height: OmluSpacing.sm),
              ],
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total', style: OmluTypography.h3),
                  Text(
                    '₹${widget.item.previewUnitPrice(_values).toStringAsFixed(2)}',
                    style: OmluTypography.h2.copyWith(color: OmluColors.accent),
                  ),
                ],
              ),
              const SizedBox(height: OmluSpacing.md),
              OmluButton(
                text: 'Add to order',
                onPressed: () {
                  if (!valid) {
                    setState(() => _showErrors = true);
                    return;
                  }
                  Navigator.pop(context, _values);
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
  void _openBill() {
    OmluRouter.push(context, StaffBillScreen(tableId: widget.table.id));
  }

  String _relativeTime(DateTime value) {
    final elapsed = DateTime.now().toUtc().difference(value.toUtc());
    if (elapsed.inMinutes < 1) return 'just now';
    if (elapsed.inHours < 1) return '${elapsed.inMinutes}m ago';
    if (elapsed.inDays < 1) return '${elapsed.inHours}h ago';
    return '${elapsed.inDays}d ago';
  }

  String _reportError(Object error) {
    if (error is ConflictException) {
      if (error.message.toLowerCase().contains('already')) {
        return 'This table has already been reported as empty.';
      }
      return 'This table session is no longer active.';
    }
    if (error is NotFoundException) {
      return 'This table session is no longer active.';
    }
    if (error is PermissionDeniedException ||
        error is AuthenticationException) {
      return 'You do not have permission to report this table.';
    }
    if (error is ApiTimeoutException ||
        (error is ApiException && error.statusCode == null)) {
      return 'Could not report the table. Check your connection and try again.';
    }
    return 'Could not report the table. Please try again.';
  }

  Future<void> _confirmReport(String sessionToken) async {
    final submitted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Consumer(
        builder: (context, ref, child) {
          final reportState = ref.watch(
            emptyTableReportProvider(widget.table.id),
          );
          final submitting = reportState.isLoading;
          return AlertDialog(
            title: const Text('Report this table as empty?'),
            content: const Text(
              'The owner or admin will review the table and decide whether to close the session.',
            ),
            actions: [
              TextButton(
                onPressed: submitting
                    ? null
                    : () => Navigator.of(dialogContext).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: submitting
                    ? null
                    : () async {
                        final success = await ref
                            .read(
                              emptyTableReportProvider(
                                widget.table.id,
                              ).notifier,
                            )
                            .submit(sessionToken);
                        if (dialogContext.mounted) {
                          Navigator.of(dialogContext).pop(success);
                        }
                      },
                style: FilledButton.styleFrom(
                  backgroundColor: OmluColors.accent,
                ),
                child: submitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Report Empty Table'),
              ),
            ],
          );
        },
      ),
    );
    if (!mounted) return;
    if (submitted == true) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Table reported as empty.')));
      return;
    }
    final state = ref.read(emptyTableReportProvider(widget.table.id));
    if (state.hasError) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_reportError(state.error!))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final table = widget.table;
    final reportState = ref.watch(emptyTableReportProvider(table.id));
    final report = reportState.valueOrNull ?? table.emptyTableReport;
    final role = ref.watch(authProvider).valueOrNull?.role;
    final access = role == StaffRole.staff
        ? ref.watch(staffAccessProvider)
        : const StaffAccessState(loading: false);

    // Closed or paid sessions must not expose stale financial actions.
    final isClosedOrPaid =
        !table.hasOpenSession ||
        table.sessionStatus == 'closed' ||
        table.billStatus == 'paid';

    if (isClosedOrPaid) {
      return const SizedBox.shrink();
    }

    Widget? reportPanel;
    if (report != null) {
      final reporterLine =
          report.reportedByName != null && report.reportedAt != null
          ? 'Reported by ${report.reportedByName} · ${_relativeTime(report.reportedAt!)}'
          : null;
      reportPanel = OmluCard(
        color: OmluColors.statusPreparing.withValues(alpha: 0.08),
        borderColor: OmluColors.statusPreparing.withValues(alpha: 0.3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Empty table reported', style: OmluTypography.h3),
            const SizedBox(height: OmluSpacing.xxs),
            const Text(
              'Waiting for owner or admin review',
              style: OmluTypography.bodyMedium,
            ),
            if (reporterLine != null) ...[
              const SizedBox(height: OmluSpacing.xs),
              Text(reporterLine, style: OmluTypography.bodySmall),
            ],
          ],
        ),
      );
    } else if (role == StaffRole.staff &&
        !access.loading &&
        !access.locked &&
        table.hasOpenSession &&
        table.sessionToken != null) {
      reportPanel = OmluCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OmluButton(
              text: 'Report Table Empty',
              onPressed: reportState.isLoading
                  ? null
                  : () => _confirmReport(table.sessionToken!),
            ),
          ],
        ),
      );
    }

    Widget withReportPanel(Widget billingPanel) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ?reportPanel,
        if (reportPanel != null && billingPanel is! SizedBox)
          const SizedBox(height: OmluSpacing.md),
        billingPanel,
      ],
    );

    // A generated bill is always opened contextually from the table.
    final billExists =
        table.billNumber != null ||
        table.billStatus != null ||
        table.billId != null;
    if (billExists) {
      return withReportPanel(
        OmluCard(
          color: OmluColors.statusReady.withValues(alpha: 0.1),
          borderColor: OmluColors.statusReady.withValues(alpha: 0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Bill Issued',
                style: OmluTypography.h3.copyWith(
                  color: OmluColors.statusReady,
                ),
              ),
              if (table.billNumber != null) ...[
                const SizedBox(height: OmluSpacing.xxs),
                Text(
                  'Bill: ${table.billNumber}',
                  style: OmluTypography.bodyMedium,
                ),
              ],
              const SizedBox(height: OmluSpacing.md),
              OmluButton(text: 'Open Bill', onPressed: _openBill),
            ],
          ),
        ),
      );
    }

    // A customer bill request can be handled immediately by Staff/Admin/Owner.
    if (table.hasActiveBillRequest) {
      return withReportPanel(
        OmluCard(
          color: OmluColors.statusNeedsBill.withValues(alpha: 0.1),
          borderColor: OmluColors.statusNeedsBill.withValues(alpha: 0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Bill requested',
                style: OmluTypography.h3.copyWith(
                  color: OmluColors.statusNeedsBill,
                ),
              ),
              const SizedBox(height: OmluSpacing.xxs),
              const Text(
                'Customer is waiting. Review the session and generate the final bill.',
                style: OmluTypography.bodyMedium,
              ),
              const SizedBox(height: OmluSpacing.md),
              OmluButton(text: 'Review & Generate Bill', onPressed: _openBill),
            ],
          ),
        ),
      );
    }

    // Active sessions expose a single contextual session/bill entry point.
    if (table.hasOpenSession && table.activeOrderCount > 0) {
      return withReportPanel(
        OmluCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Session & billing', style: OmluTypography.h3),
              const SizedBox(height: OmluSpacing.xs),
              OmluButton(text: 'View Session & Bill', onPressed: _openBill),
            ],
          ),
        ),
      );
    }

    return withReportPanel(const SizedBox.shrink());
  }
}
