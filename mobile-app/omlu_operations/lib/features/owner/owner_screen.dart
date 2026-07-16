import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_skeleton_loader.dart';
import '../auth_provider.dart';
import '../staff/tables_provider.dart';
import '../staff/service_requests_provider.dart';

final ownerTabProvider = StateProvider<int>((ref) => 0);
final dashboardSummaryProvider = FutureProvider<Map<String, Object?>>((
  ref,
) async {
  final api = ref.watch(operationsApiProvider);
  return api.fetchDashboardSummary();
});

class OwnerScreen extends ConsumerWidget {
  const OwnerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeTab = ref.watch(ownerTabProvider);

    final List<Widget> screens = const [
      _OwnerDashboardTab(),
      _OwnerTablesTab(),
      _OwnerRequestsTab(),
    ];

    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isPhone = constraints.maxWidth < 600;

          if (isPhone) {
            return Scaffold(
              body: IndexedStack(index: activeTab, children: screens),
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: activeTab,
                selectedItemColor: OmluColors.accent,
                unselectedItemColor: OmluColors.textSecondary,
                onTap: (idx) => ref.read(ownerTabProvider.notifier).state = idx,
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.dashboard_rounded),
                    label: 'Dashboard',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.grid_view_rounded),
                    label: 'Tables',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.notifications_rounded),
                    label: 'Requests',
                  ),
                ],
              ),
            );
          } else {
            return Row(
              children: [
                NavigationRail(
                  selectedIndex: activeTab,
                  onDestinationSelected: (idx) =>
                      ref.read(ownerTabProvider.notifier).state = idx,
                  labelType: NavigationRailLabelType.all,
                  selectedIconTheme: const IconThemeData(
                    color: OmluColors.accent,
                  ),
                  destinations: const [
                    NavigationRailDestination(
                      icon: Icon(Icons.dashboard_rounded),
                      label: Text('Dashboard'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.grid_view_rounded),
                      label: Text('Tables'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.notifications_rounded),
                      label: Text('Requests'),
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
                          onPressed: () =>
                              ref.read(authProvider.notifier).logout(),
                        ),
                      ),
                    ),
                  ),
                ),
                const VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: OmluColors.border,
                ),
                Expanded(
                  child: IndexedStack(index: activeTab, children: screens),
                ),
              ],
            );
          }
        },
      ),
    );
  }
}

class _OwnerDashboardTab extends ConsumerWidget {
  const _OwnerDashboardTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardSummaryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Owner Dashboard', style: OmluTypography.h1),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(
              Icons.refresh_rounded,
              color: OmluColors.textPrimary,
            ),
            onPressed: () => ref.refresh(dashboardSummaryProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(dashboardSummaryProvider),
        child: dashboard.when(
          data: (data) {
            final revenue = data['today_revenue']?.toString() ?? '0.00';
            final orderCount = data['today_order_count']?.toString() ?? '0';
            final avgOrder = data['average_order_value']?.toString() ?? '0.00';

            return ListView(
              padding: const EdgeInsets.all(OmluSpacing.md),
              children: [
                Text('Today\'s Performance', style: OmluTypography.h2),
                const SizedBox(height: OmluSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: _MetricCard(
                        title: 'Revenue',
                        value: '₹$revenue',
                        color: OmluColors.statusAvailable,
                      ),
                    ),
                    const SizedBox(width: OmluSpacing.md),
                    Expanded(
                      child: _MetricCard(
                        title: 'Orders',
                        value: orderCount,
                        color: OmluColors.statusOrdering,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: OmluSpacing.md),
                _MetricCard(
                  title: 'Average Order Value',
                  value: '₹$avgOrder',
                  color: OmluColors.statusReady,
                ),
              ],
            );
          },
          loading: () => ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: const [
              OmluSkeletonLoader(width: double.infinity, height: 120),
              SizedBox(height: 16),
              OmluSkeletonLoader(width: double.infinity, height: 120),
            ],
          ),
          error: (err, st) =>
              Center(child: Text('Error loading dashboard: $err')),
        ),
      ),
    );
  }
}

class _OwnerTablesTab extends ConsumerWidget {
  const _OwnerTablesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesState = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Restaurant Tables', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: tablesState.when(
        data: (tables) {
          final occupied = tables
              .where((t) => t.state == 'occupied' || t.hasOpenSession)
              .length;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(OmluSpacing.md),
                child: OmluCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Occupied Tables', style: OmluTypography.h3),
                      Text(
                        '$occupied / ${tables.length}',
                        style: OmluTypography.h2.copyWith(
                          color: OmluColors.accent,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(
                    horizontal: OmluSpacing.md,
                  ),
                  itemCount: tables.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: OmluSpacing.sm),
                  itemBuilder: (context, index) {
                    final t = tables[index];
                    final isOccupied =
                        t.state == 'occupied' || t.hasOpenSession;
                    return OmluCard(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            t.tableNumber,
                            style: OmluTypography.bodyLarge.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            isOccupied
                                ? 'Occupied - ₹${t.currentBillAmount.toStringAsFixed(2)}'
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
                    );
                  },
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) => Center(child: Text('Error: $err')),
      ),
    );
  }
}

class _OwnerRequestsTab extends ConsumerWidget {
  const _OwnerRequestsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsState = ref.watch(serviceRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Requests', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: requestsState.when(
        data: (requests) {
          final pending = requests.where((req) {
            if (req is! Map) return false;
            final status = req['status']?.toString().toLowerCase();
            final resolvedAt = req['resolved_at'];
            return status == 'pending' || resolvedAt == null;
          }).toList();

          if (pending.isEmpty) {
            return const Center(child: Text('No active service requests.'));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(OmluSpacing.md),
            itemCount: pending.length,
            separatorBuilder: (context, index) =>
                const SizedBox(height: OmluSpacing.md),
            itemBuilder: (context, index) {
              final req = pending[index] as Map;
              final tableNumber = req['table_number']?.toString() ?? 'Table';
              final type = req['request_type']?.toString() ?? 'Request';

              return OmluCard(
                child: ListTile(
                  title: Text(tableNumber, style: OmluTypography.h3),
                  subtitle: Text(type, style: OmluTypography.bodyMedium),
                  trailing: const Icon(
                    Icons.warning_amber_rounded,
                    color: OmluColors.accent,
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) => Center(child: Text('Error: $err')),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.color,
  });

  final String title;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return OmluCard(
      borderColor: color.withOpacity(0.3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: OmluTypography.label.copyWith(
              color: OmluColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: OmluTypography.h1.copyWith(color: color, fontSize: 26),
          ),
        ],
      ),
    );
  }
}
