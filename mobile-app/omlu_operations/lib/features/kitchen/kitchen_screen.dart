import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../../core/models/operations_models.dart';
import '../auth_provider.dart';
import 'kitchen_orders_provider.dart';
import '../onboarding/role_guide.dart';
import '../../core/models/role_session.dart';

class KitchenScreen extends ConsumerStatefulWidget {
  const KitchenScreen({super.key});

  @override
  ConsumerState<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends ConsumerState<KitchenScreen> {
  final Set<String> _processingTokens = {};

  Future<void> _changeStatus(String token, String currentStatus) async {
    setState(() => _processingTokens.add(token));
    try {
      await ref
          .read(kitchenOrdersProvider.notifier)
          .advanceStatus(token, currentStatus);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not update the order. Check the connection and try again.')));
      }
    } finally {
      if (mounted) {
        setState(() => _processingTokens.remove(token));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ordersState = ref.watch(kitchenOrdersProvider);
    final board = Scaffold(
      appBar: AppBar(
        title: const Text('OMLU Kitchen', style: OmluTypography.h1),
        centerTitle: false,
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          const RealtimeStatusChip(),
          PopupMenuButton<String>(
            tooltip: 'Profile and help',
            onSelected: (value) {
              if (value == 'help') showRoleHelp(context, StaffRole.kitchen);
              if (value == 'refresh') ref.read(kitchenOrdersProvider.notifier).fetchOrders();
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
      body: ordersState.when(
        data: (orders) => LayoutBuilder(
          builder: (context, constraints) => constraints.maxWidth >= 600
              ? _TabletBoardView(orders: orders, processingTokens: _processingTokens, onAction: _changeStatus)
              : _MobileListView(orders: orders, processingTokens: _processingTokens, onAction: _changeStatus),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) => Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.cloud_off_rounded, size: 48, color: OmluColors.textSecondary),
              const SizedBox(height: 16),
              const Text('Could not load orders. Check the connection and try again.', textAlign: TextAlign.center, style: OmluTypography.bodyMedium),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => ref.read(kitchenOrdersProvider.notifier).fetchOrders(), child: const Text('Retry')),
            ]),
          ),
        ),
      ),
    );
    return LayoutBuilder(builder: (context, constraints) {
      if (constraints.maxWidth < 600) return board;
      return Scaffold(body: Row(children: [
        NavigationRail(
            selectedIndex: 0,
            labelType: NavigationRailLabelType.all,
            selectedIconTheme: const IconThemeData(color: OmluColors.accent),
            unselectedIconTheme: const IconThemeData(
              color: OmluColors.textSecondary,
            ),
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.restaurant_rounded),
                label: Text('Kitchen Board'),
              ),
            ],
            trailing: Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: OmluSpacing.md),
                  child: IconButton(
                    icon: const Icon(
                      Icons.logout_rounded,
                      color: OmluColors.textSecondary,
                    ),
                    onPressed: () => ref.read(authProvider.notifier).logout(),
                  ),
                ),
              ),
            ),
          ),
          const VerticalDivider(
            thickness: 1,
            width: 1,
            color: OmluColors.border,
          ),

        Expanded(child: board),
      ]));
    });
  }
}

class _TabletBoardView extends StatelessWidget {
  const _TabletBoardView({
    required this.orders,
    required this.processingTokens,
    required this.onAction,
  });

  final List<KitchenOrder> orders;
  final Set<String> processingTokens;
  final Function(String, String) onAction;

  @override
  Widget build(BuildContext context) {
    // Columns: Received (pending, accepted), Preparing (preparing), Ready (ready)
    final received = orders
        .where((o) => o.status == 'pending' || o.status == 'accepted')
        .toList();
    final preparing = orders.where((o) => o.status == 'preparing').toList();
    final ready = orders.where((o) => o.status == 'ready').toList();

    return Row(
      children: [
        Expanded(
          child: _KitchenColumn(
            title: 'New',
            color: OmluColors.statusAvailable,
            orders: received,
            processingTokens: processingTokens,
            onAction: onAction,
          ),
        ),
        const VerticalDivider(width: 1, thickness: 1, color: OmluColors.border),
        Expanded(
          child: _KitchenColumn(
            title: 'Preparing',
            color: OmluColors.statusPreparing,
            orders: preparing,
            processingTokens: processingTokens,
            onAction: onAction,
          ),
        ),
        const VerticalDivider(width: 1, thickness: 1, color: OmluColors.border),
        Expanded(
          child: _KitchenColumn(
            title: 'Ready',
            color: OmluColors.statusReady,
            orders: ready,
            processingTokens: processingTokens,
            onAction: onAction,
          ),
        ),
      ],
    );
  }
}

class _MobileListView extends StatelessWidget {
  const _MobileListView({
    required this.orders,
    required this.processingTokens,
    required this.onAction,
  });

  final List<KitchenOrder> orders;
  final Set<String> processingTokens;
  final Function(String, String) onAction;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return const Center(child: Text('No active kitchen orders.'));
    }

    return ListView.separated(
      padding: const EdgeInsets.all(OmluSpacing.md),
      itemCount: orders.length,
      separatorBuilder: (context, index) =>
          const SizedBox(height: OmluSpacing.md),
      itemBuilder: (context, index) {
        return _KitchenOrderCard(
          order: orders[index],
          isProcessing: processingTokens.contains(orders[index].publicToken),
          onAction: onAction,
        );
      },
    );
  }
}

class _KitchenColumn extends StatelessWidget {
  const _KitchenColumn({
    required this.title,
    required this.color,
    required this.orders,
    required this.processingTokens,
    required this.onAction,
  });

  final String title;
  final Color color;
  final List<KitchenOrder> orders;
  final Set<String> processingTokens;
  final Function(String, String) onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: color.withValues(alpha: 0.02),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(OmluSpacing.md),
            color: color.withValues(alpha: 0.08),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: OmluTypography.h2.copyWith(
                    color: color,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: OmluRadius.borderCircular,
                  ),
                  child: Text(
                    '${orders.length}',
                    style: OmluTypography.label.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(OmluSpacing.md),
              itemCount: orders.length,
              separatorBuilder: (context, index) =>
                  const SizedBox(height: OmluSpacing.md),
              itemBuilder: (context, index) {
                final order = orders[index];
                return _KitchenOrderCard(
                  order: order,
                  isProcessing: processingTokens.contains(order.publicToken),
                  onAction: onAction,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _KitchenOrderCard extends StatelessWidget {
  const _KitchenOrderCard({
    required this.order,
    required this.isProcessing,
    required this.onAction,
  });

  final KitchenOrder order;
  final bool isProcessing;
  final Function(String, String) onAction;

  String _getActionButtonLabel(String status) {
    return switch (status) {
      'pending' || 'accepted' => 'Start Preparing',
      'preparing' => 'Mark Ready',
      _ => '',
    };
  }

  String _formatElapsedTime(DateTime createdAt) {
    final diff = DateTime.now().difference(createdAt);
    if (diff.inMinutes <= 0) return 'Just now';
    return '${diff.inMinutes}m ago';
  }

  @override
  Widget build(BuildContext context) {
    return OmluCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  order.tableNumber,
                  style: OmluTypography.h2.copyWith(fontSize: 22),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: OmluSpacing.xs),
              Text(
                _formatElapsedTime(order.createdAt),
                style: OmluTypography.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: OmluSpacing.xxs),
          Text('Order: #${order.orderNumber}', style: OmluTypography.bodySmall),
          const Divider(height: 24, color: OmluColors.border),

          // Items
          ...order.items.map((item) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 6.0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item.quantity}x ',
                    style: OmluTypography.bodyLarge.copyWith(
                      fontWeight: FontWeight.bold,
                      color: OmluColors.accent,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: OmluTypography.bodyLarge.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (item.note != null && item.note!.trim().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2.0),
                            child: Text(
                              'Note: ${item.note}',
                              style: OmluTypography.bodySmall.copyWith(
                                color: Colors.red.shade900,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),

          if (order.customerNote != null &&
              order.customerNote!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: OmluRadius.borderSm,
              ),
              child: Text(
                'Customer Note: ${order.customerNote}',
                style: OmluTypography.bodySmall.copyWith(
                  color: Colors.orange.shade900,
                ),
              ),
            ),
          ],

          const SizedBox(height: OmluSpacing.md),

          // Action button
          if (order.status != 'ready')
            OmluButton(
              text: _getActionButtonLabel(order.status),
              isLoading: isProcessing,
              onPressed: isProcessing ? null : () => onAction(order.publicToken, order.status),
            ),
        ],
      ),
    );
  }
}
