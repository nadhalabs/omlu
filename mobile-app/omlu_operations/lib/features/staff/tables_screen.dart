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
import '../auth_provider.dart';
import '../onboarding/role_guide.dart';
import '../../core/models/role_session.dart';

class TablesScreen extends ConsumerWidget {
  const TablesScreen({super.key});

  String _getTableStatus(StaffTableSummary table) {
    if (table.billStatus == 'payment_pending') return 'Waiting for Payment';
    if (table.billRequested) return 'Bill Requested';
    if (table.attention.contains('ready_order')) return 'Food Ready';
    if (table.activeOrderCount > 0 || table.state == 'occupied' || table.hasOpenSession) return 'Occupied';
    return 'Available';
  }

  Color _getStatusColor(String status) {
    return switch (status) {
      'Bill Requested' || 'Waiting for Payment' => OmluColors.statusNeedsBill,
      'Food Ready' => OmluColors.statusReady,
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
          PopupMenuButton<String>(
            tooltip: 'Profile and help',
            onSelected: (value) {
              if (value == 'help') showRoleHelp(context, StaffRole.staff);
              if (value == 'refresh') ref.read(tablesProvider.notifier).fetchTables();
              if (value == 'logout') ref.read(authProvider.notifier).logout();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'help', child: Text('Help')),
              PopupMenuItem(value: 'refresh', child: Text('Refresh')),
              PopupMenuItem(value: 'logout', child: Text('Logout')),
            ],
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

          final occupied = tables.where((table) => table.hasOpenSession || table.state == 'occupied').length;
          final ready = tables.where((table) => table.attention.contains('ready_order')).length;
          final requests = tables.where((table) => table.attention.any((item) => item.contains('request'))).length;
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  _SummaryChip(label: 'Occupied', count: occupied),
                  _SummaryChip(label: 'Ready', count: ready),
                  _SummaryChip(label: 'Requests', count: requests),
                ]),
              )),
              SliverPadding(
                padding: const EdgeInsets.all(OmluSpacing.md),
                sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 220,
              mainAxisExtent: 175,
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
                              '${table.activeOrderCount} active order${table.activeOrderCount == 1 ? '' : 's'}${table.currentBillAmount > 0 ? ' · ₹${table.currentBillAmount.toStringAsFixed(2)}' : ''}',
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
                ),
              ),
            ],
          );
        },
        loading: () => GridView.builder(
          padding: const EdgeInsets.all(OmluSpacing.md),
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 220,
            mainAxisExtent: 175,
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
              const Text('Could not load tables. Check the connection and try again.', style: OmluTypography.bodyMedium),
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

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({required this.label, required this.count});
  final String label;
  final int count;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(color: OmluColors.surface, borderRadius: OmluRadius.borderCircular, border: Border.all(color: OmluColors.border)),
    child: Text('$label $count', style: OmluTypography.label.copyWith(fontWeight: FontWeight.w700)),
  );
}
