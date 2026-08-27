import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/models/role_session.dart';
import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import '../payments/pending_payments_tab.dart';
import '../payments/billing_counter_screen.dart';
import '../payments/pending_bill_review_screen.dart';
import '../printing/printer_settings_screen.dart';
import '../realtime_connection_provider.dart';
import '../staff/tables_provider.dart';
import '../staff/staff_bill_screen.dart';
import '../staff/requests_screen.dart';
import '../kitchen/kitchen_screen.dart';
import 'session_controls_screen.dart';
import 'menu_management_screen.dart';
import 'staff_management_screen.dart';
import 'settings_management_screen.dart';
import 'reports_screen.dart';
import 'history_explorer_screen.dart';
import 'gst_registers_screen.dart';
import 'operational_controls_screen.dart';
import 'print_bridge_admin_screen.dart';

final adminTabProvider = StateProvider<int>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return 0;
});

final staffAccountsProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  final api = ref.watch(operationsApiProvider);
  return api.fetchStaffAccounts();
});

final adminDashboardProvider = FutureProvider<Map<String, Object?>>((
  ref,
) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchDashboardSummary();
});

class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeTab = ref.watch(adminTabProvider);
    final pendingCount = ref.watch(pendingPaymentsCountProvider);
    ref.listen(realtimeEventStreamProvider, (previous, next) {
      next.whenData((event) {
        if (event.type != 'bill.payment_pending') return;
        final state = event.state;
        final billNumber = state['bill_number']?.toString();
        final table = state['table_name']?.toString() ?? 'Table';
        final amount =
            double.tryParse(state['grand_total']?.toString() ?? '') ?? 0;
        final sender = state['sent_by_name']?.toString() ?? 'Staff';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Payment pending\n$table · ₹${amount.toStringAsFixed(2)}\nSent by $sender',
            ),
            action: SnackBarAction(
              label: 'Tap to review',
              onPressed: () {
                ref.read(adminTabProvider.notifier).state = 2;
                if (billNumber != null) {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          PendingBillReviewScreen(billNumber: billNumber),
                    ),
                  );
                }
              },
            ),
          ),
        );
      });
    });

    final List<Widget> screens = const [
      _AdminOverviewTab(),
      KitchenScreen(embedded: true),
      _AdminTablesTab(),
      BillingCounterScreen(actorRole: StaffRole.admin),
      ManagementHubScreen(),
    ];

    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isPhone = !usePersistentNavigation(constraints.maxWidth);

          if (isPhone) {
            return Scaffold(
              body: IndexedStack(index: activeTab, children: screens),
              bottomNavigationBar: BottomNavigationBar(
                type: BottomNavigationBarType.fixed,
                currentIndex: activeTab,
                selectedItemColor: OmluColors.accent,
                unselectedItemColor: OmluColors.textSecondary,
                onTap: (idx) => ref.read(adminTabProvider.notifier).state = idx,
                items: [
                  const BottomNavigationBarItem(
                    icon: Icon(Icons.admin_panel_settings_rounded),
                    label: 'Overview',
                  ),
                  const BottomNavigationBarItem(
                    icon: Icon(Icons.receipt_long_rounded),
                    label: 'Orders',
                  ),
                  const BottomNavigationBarItem(
                    icon: Icon(Icons.grid_view_rounded),
                    label: 'Tables',
                  ),
                  BottomNavigationBarItem(
                    icon: _PaymentBadge(count: pendingCount),
                    label:
                        'Billing${pendingCount > 0 ? '  $pendingCount' : ''}',
                  ),
                  const BottomNavigationBarItem(
                    icon: Icon(Icons.more_horiz_rounded),
                    label: 'More',
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
                      ref.read(adminTabProvider.notifier).state = idx,
                  labelType: NavigationRailLabelType.all,
                  selectedIconTheme: const IconThemeData(
                    color: OmluColors.accent,
                  ),
                  destinations: [
                    NavigationRailDestination(
                      icon: Icon(Icons.admin_panel_settings_rounded),
                      label: Text('Overview'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.receipt_long_rounded),
                      label: Text('Live Orders'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.grid_view_rounded),
                      label: Text('Tables'),
                    ),
                    NavigationRailDestination(
                      icon: _PaymentBadge(count: pendingCount),
                      label: Text(
                        'Billing Counter${pendingCount > 0 ? '  $pendingCount' : ''}',
                      ),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.more_horiz_rounded),
                      label: Text('More'),
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

class _PaymentBadge extends StatelessWidget {
  const _PaymentBadge({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) => Badge(
    isLabelVisible: count > 0,
    label: Text('$count'),
    child: const Icon(Icons.payments_rounded),
  );
}

class _AdminOverviewTab extends ConsumerWidget {
  const _AdminOverviewTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider).value;
    final dashboard = ref.watch(adminDashboardProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('OMLU Admin · Overview', style: OmluTypography.h1),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          const RealtimeStatusChip(),
          IconButton(
            tooltip: 'Printer setup',
            icon: const Icon(
              Icons.print_rounded,
              color: OmluColors.textPrimary,
            ),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const PrinterSettingsScreen(),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Refresh dashboard',
            onPressed: () => ref.invalidate(adminDashboardProvider),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(adminDashboardProvider.future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(OmluSpacing.md),
          children: [
            dashboard.when(
              loading: () => const LinearProgressIndicator(),
              error: (error, _) => OmluCard(
                child: Column(
                  children: [
                    Text(userFacingError(error), textAlign: TextAlign.center),
                    TextButton(
                      onPressed: () => ref.invalidate(adminDashboardProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (data) => LayoutBuilder(
                builder: (context, constraints) {
                  final metrics = <(String, String, IconData)>[
                    (
                      'Revenue',
                      '₹${data['collected_revenue'] ?? data['today_revenue'] ?? '0.00'}',
                      Icons.currency_rupee_rounded,
                    ),
                    (
                      'Orders today',
                      '${data['today_order_count'] ?? 0}',
                      Icons.receipt_long_rounded,
                    ),
                    (
                      'Live orders',
                      '${data['pending_order_count'] ?? 0}',
                      Icons.local_fire_department_rounded,
                    ),
                    (
                      'Open sessions',
                      '${data['open_session_count'] ?? 0}',
                      Icons.table_restaurant_rounded,
                    ),
                    (
                      'Payments due',
                      '${data['payment_pending_count'] ?? 0}',
                      Icons.payments_rounded,
                    ),
                    (
                      'Requests',
                      '${data['active_service_request_count'] ?? 0}',
                      Icons.notifications_active_rounded,
                    ),
                  ];
                  final columns = constraints.maxWidth >= 1000
                      ? 3
                      : constraints.maxWidth >= 600
                      ? 2
                      : 2;
                  return GridView.count(
                    crossAxisCount: columns,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: OmluSpacing.sm,
                    crossAxisSpacing: OmluSpacing.sm,
                    childAspectRatio: constraints.maxWidth < 600 ? 1.45 : 2.2,
                    children: [
                      for (final metric in metrics)
                        OmluCard(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(metric.$3, color: OmluColors.accent),
                              const SizedBox(height: 6),
                              Text(metric.$2, style: OmluTypography.h2),
                              Text(
                                metric.$1,
                                textAlign: TextAlign.center,
                                style: OmluTypography.bodySmall,
                              ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: OmluSpacing.md),
            OmluCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Admin Profile', style: OmluTypography.h2),
                  const SizedBox(height: OmluSpacing.md),
                  Text(
                    'Name: ${session?.profile.name ?? ''}',
                    style: OmluTypography.bodyLarge,
                  ),
                  const SizedBox(height: OmluSpacing.xs),
                  Text(
                    'Role: Administrator',
                    style: OmluTypography.bodyMedium.copyWith(
                      color: OmluColors.accent,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: OmluSpacing.xs),
                  Text(
                    'Restaurant: ${session?.profile.restaurantName ?? ''}',
                    style: OmluTypography.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminTablesTab extends ConsumerStatefulWidget {
  const _AdminTablesTab();

  @override
  ConsumerState<_AdminTablesTab> createState() => _AdminTablesTabState();
}

class _AdminTablesTabState extends ConsumerState<_AdminTablesTab> {
  int? _selectedTableId;

  @override
  Widget build(BuildContext context) {
    final tablesState = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Tables', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: tablesState.when(
        data: (tables) {
          if (tables.isEmpty) {
            return const Center(child: Text('No tables configured.'));
          }
          final wide = useSplitView(MediaQuery.sizeOf(context).width);
          final grid = GridView.builder(
            padding: const EdgeInsets.all(OmluSpacing.md),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: wide ? 2 : 1,
              childAspectRatio: wide ? 1.75 : 3.1,
              mainAxisSpacing: OmluSpacing.sm,
              crossAxisSpacing: OmluSpacing.sm,
            ),
            itemCount: tables.length,
            itemBuilder: (context, index) {
              final t = tables[index];
              final hasSession = t.hasOpenSession || t.state == 'occupied';
              return OmluCard(
                onTap: hasSession
                    ? () => wide
                          ? setState(() => _selectedTableId = t.id)
                          : Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => StaffBillScreen(
                                  tableId: t.id,
                                  actorRole: StaffRole.admin,
                                ),
                              ),
                            )
                    : null,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(t.tableNumber, style: OmluTypography.h3),
                    Text(
                      t.state.toUpperCase(),
                      style: OmluTypography.bodyMedium.copyWith(
                        color: t.state == 'occupied'
                            ? OmluColors.statusNeedsBill
                            : OmluColors.statusAvailable,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              );
            },
          );
          if (!wide) return grid;
          return Row(
            children: [
              SizedBox(width: 400, child: grid),
              const VerticalDivider(width: 1),
              Expanded(
                child: _selectedTableId == null
                    ? const Center(
                        child: Text(
                          'Select an occupied table for session and billing details.',
                        ),
                      )
                    : StaffBillScreen(
                        tableId: _selectedTableId!,
                        actorRole: StaffRole.admin,
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

class ManagementHubScreen extends StatelessWidget {
  const ManagementHubScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Administration', style: OmluTypography.h2),
    ),
    body: ListView(
      padding: const EdgeInsets.all(OmluSpacing.md),
      children: [
        const _MoreTile(
          icon: Icons.restaurant_menu_rounded,
          title: 'Menu management',
          subtitle: 'Categories, items, variants, add-ons and availability',
          page: MenuManagementScreen(),
        ),
        const _MoreTile(
          icon: Icons.manage_accounts_rounded,
          title: 'Staff & permissions',
          subtitle: 'Accounts, roles, access and active sessions',
          page: StaffManagementScreen(),
        ),
        const _MoreTile(
          icon: Icons.settings_rounded,
          title: 'Restaurant settings',
          subtitle: 'Operations, GST, reviews and printer destinations',
          page: SettingsManagementScreen(),
        ),
        const _MoreTile(
          icon: Icons.insights_rounded,
          title: 'Reports & performance',
          subtitle: 'Revenue, orders, sessions and GST summaries',
          page: ReportsScreen(),
        ),
        const _MoreTile(
          icon: Icons.history_rounded,
          title: 'Historical operations',
          subtitle: 'Orders, bills, payments and dining sessions',
          page: HistoryExplorerScreen(),
        ),
        const _MoreTile(
          icon: Icons.account_balance_rounded,
          title: 'GST registers',
          subtitle: 'Sales, HSN, rate, B2B/B2C and document registers',
          page: GstRegistersScreen(),
        ),
        const _MoreTile(
          icon: Icons.power_settings_new_rounded,
          title: 'Operational controls',
          subtitle: 'Restaurant status, closing and staff locks',
          page: OperationalControlsScreen(),
        ),
        const _MoreTile(
          icon: Icons.print_rounded,
          title: 'Print Bridge administration',
          subtitle: 'Installations, connectivity and failed kitchen jobs',
          page: PrintBridgeAdminScreen(),
        ),
        const _MoreTile(
          icon: Icons.notifications_rounded,
          title: 'Notifications & requests',
          subtitle: 'Live customer calls and resolved activity',
          page: RequestsScreen(),
        ),
        const _MoreTile(
          icon: Icons.devices_rounded,
          title: 'Customer sessions',
          subtitle: 'Join codes, devices and empty sessions',
          page: SessionControlsScreen(),
        ),
        const _MoreTile(
          icon: Icons.print_rounded,
          title: 'Printer status & setup',
          subtitle: 'Connection, configuration and test print',
          page: PrinterSettingsScreen(),
        ),
      ],
    ),
  );
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.page,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget page;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      minVerticalPadding: 16,
      leading: Icon(icon, color: OmluColors.accent),
      title: Text(title, style: OmluTypography.h3),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: () => Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => page)),
    ),
  );
}

// Retained for compatibility with older widget tests and deep links.
// ignore: unused_element
class _AdminStaffTab extends ConsumerWidget {
  const _AdminStaffTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffState = ref.watch(staffAccountsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Directory', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(
              Icons.refresh_rounded,
              color: OmluColors.textPrimary,
            ),
            onPressed: () => ref.refresh(staffAccountsProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(staffAccountsProvider),
        child: staffState.when(
          data: (accounts) {
            if (accounts.isEmpty) {
              return const Center(child: Text('No staff accounts configured.'));
            }

            return ListView.separated(
              padding: const EdgeInsets.all(OmluSpacing.md),
              itemCount: accounts.length,
              separatorBuilder: (context, index) =>
                  const SizedBox(height: OmluSpacing.sm),
              itemBuilder: (context, index) {
                final user = accounts[index] as Map;
                final name = user['name']?.toString() ?? 'Name';
                final username = user['username']?.toString() ?? 'Username';
                final role = user['role']?.toString() ?? 'staff';
                final status = user['status']?.toString() ?? 'active';

                return OmluCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(name, style: OmluTypography.h3),
                    subtitle: Text(
                      '@$username  •  ${role.toUpperCase()}',
                      style: OmluTypography.bodyMedium,
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: status == 'active'
                            ? OmluColors.statusAvailable.withValues(alpha: 0.1)
                            : Colors.red.shade50,
                        borderRadius: OmluRadius.borderSm,
                      ),
                      child: Text(
                        status.toUpperCase(),
                        style: OmluTypography.label.copyWith(
                          color: status == 'active'
                              ? OmluColors.statusAvailable
                              : Colors.red.shade800,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, st) => Center(child: Text(userFacingError(err))),
        ),
      ),
    );
  }
}
