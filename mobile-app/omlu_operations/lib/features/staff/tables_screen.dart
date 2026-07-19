import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_skeleton_loader.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../../core/models/operations_models.dart';
import 'tables_provider.dart';
import 'cart_provider.dart';
import 'staff_shell.dart';

class TablesScreen extends ConsumerWidget {
  const TablesScreen({super.key});

  String _getTableStatus(StaffTableSummary table) {
    if (table.billRequested) return 'Needs Bill';
    if (table.attention.contains('ready_order')) return 'Ready';
    if (table.activeOrderCount > 0) return 'Preparing';
    if (table.state == 'occupied' || table.hasOpenSession) return 'Ordering';
    return 'Available';
  }

  Color _getStatusColor(String status) {
    return switch (status) {
      'Needs Bill' => OmluColors.statusNeedsBill,
      'Ready' => OmluColors.statusReady,
      'Preparing' => OmluColors.statusPreparing,
      'Ordering' => OmluColors.statusOrdering,
      _ => OmluColors.statusAvailable,
    };
  }

  Future<void> _handleTableTap(
    BuildContext context,
    WidgetRef ref,
    StaffTableSummary table,
  ) async {
    final cart = ref.read(cartProvider);
    final currentSelected = ref.read(selectedTableIdProvider);

    void proceed() {
      ref.read(selectedTableIdProvider.notifier).state = table.id;
      ref
          .read(cartProvider.notifier)
          .setTable(
            table.id,
            table.tableNumber,
          ); // reuse tableNumber as slug or identifier
      ref.read(staffTabProvider.notifier).state = 1; // Switch to New Order tab
    }

    if (!cart.isEmpty && currentSelected != table.id) {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Change Table?'),
          content: const Text('Clear the current order and switch tables?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: FilledButton.styleFrom(backgroundColor: OmluColors.accent),
              child: const Text('Confirm'),
            ),
          ],
        ),
      );
      if (confirm == true) {
        ref.read(cartProvider.notifier).clear();
        proceed();
      }
    } else {
      proceed();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesState = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('OMLU Staff · Tables', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          const RealtimeStatusChip(),
          IconButton(
            icon: const Icon(
              Icons.refresh_rounded,
              color: OmluColors.textPrimary,
            ),
            onPressed: () => ref.read(tablesProvider.notifier).fetchTables(),
          ),
        ],
      ),
      body: tablesState.when(
        data: (tables) {
          if (tables.isEmpty) {
            return const Center(
              child: Text(
                'No tables configured.',
                style: OmluTypography.bodyMedium,
              ),
            );
          }

          return GridView.builder(
            padding: const EdgeInsets.all(OmluSpacing.md),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 220,
              mainAxisExtent: 150,
              crossAxisSpacing: OmluSpacing.md,
              mainAxisSpacing: OmluSpacing.md,
            ),
            itemCount: tables.length,
            itemBuilder: (context, index) {
              final table = tables[index];
              final status = _getTableStatus(table);
              final statusColor = _getStatusColor(status);
              final showBill =
                  table.activeOrderCount > 0 || table.state == 'occupied';

              return OmluCard(
                padding: EdgeInsets.zero,
                onTap: () => _handleTableTap(context, ref, table),
                borderColor: statusColor.withValues(alpha: 0.3),
                child: Padding(
                  padding: const EdgeInsets.all(OmluSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            child: Text(
                              table.tableNumber,
                              style: OmluTypography.h2.copyWith(fontSize: 22),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (table.openedMinutesAgo != null &&
                              table.openedMinutesAgo! > 0) ...[
                            const SizedBox(width: OmluSpacing.xs),
                            Text(
                              '${table.openedMinutesAgo}m ago',
                              style: OmluTypography.bodySmall,
                            ),
                          ],
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.12),
                              borderRadius: OmluRadius.borderSm,
                            ),
                            child: Text(
                              status,
                              style: OmluTypography.label.copyWith(
                                color: statusColor,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(height: OmluSpacing.xs),
                          if (showBill)
                            Text(
                              'Total: ₹${table.currentBillAmount.toStringAsFixed(2)}',
                              style: OmluTypography.bodyMedium.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            )
                          else
                            const Text('--', style: OmluTypography.bodyMedium),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
        loading: () => GridView.builder(
          padding: const EdgeInsets.all(OmluSpacing.md),
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 220,
            mainAxisExtent: 150,
            crossAxisSpacing: OmluSpacing.md,
            mainAxisSpacing: OmluSpacing.md,
          ),
          itemCount: 8,
          itemBuilder: (context, index) =>
              const OmluSkeletonLoader(width: double.infinity, height: 150),
        ),
        error: (err, st) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: Colors.red,
              ),
              const SizedBox(height: 16),
              Text('Error: $err', style: OmluTypography.bodyMedium),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(tablesProvider.notifier).fetchTables(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
