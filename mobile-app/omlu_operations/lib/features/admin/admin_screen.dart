import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import '../payments/pending_payments_tab.dart';
import '../payments/pending_bill_review_screen.dart';
import '../realtime_connection_provider.dart';
import '../staff/tables_provider.dart';
import '../staff/staff_bill_screen.dart';

final adminTabProvider = StateProvider<int>((ref) => 0);

final staffAccountsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.watch(operationsApiProvider);
  return api.fetchStaffAccounts();
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
      _AdminTablesTab(),
      PendingPaymentsTab(),
      _AdminStaffTab(),
    ];

    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isPhone = constraints.maxWidth < 600;

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
                    icon: Icon(Icons.grid_view_rounded),
                    label: 'Tables',
                  ),
                  BottomNavigationBarItem(
                    icon: _PaymentBadge(count: pendingCount),
                    label:
                        'Pending payments${pendingCount > 0 ? '  $pendingCount' : ''}',
                  ),
                  const BottomNavigationBarItem(
                    icon: Icon(Icons.people_rounded),
                    label: 'Staff',
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
                      icon: Icon(Icons.grid_view_rounded),
                      label: Text('Tables'),
                    ),
                    NavigationRailDestination(
                      icon: _PaymentBadge(count: pendingCount),
                      label: Text(
                        'Pending payments${pendingCount > 0 ? '  $pendingCount' : ''}',
                      ),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.people_rounded),
                      label: Text('Staff'),
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('OMLU Admin · Overview', style: OmluTypography.h1),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: const [RealtimeStatusChip()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(OmluSpacing.md),
        children: [
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
    );
  }
}

class _AdminTablesTab extends ConsumerWidget {
  const _AdminTablesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tablesState = ref.watch(tablesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Tables', style: OmluTypography.h2),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: tablesState.when(
        data: (tables) {
          return ListView.separated(
            padding: const EdgeInsets.all(OmluSpacing.md),
            itemCount: tables.length,
            separatorBuilder: (context, index) =>
                const SizedBox(height: OmluSpacing.sm),
            itemBuilder: (context, index) {
              final t = tables[index];
              final hasSession = t.hasOpenSession || t.state == 'occupied';
              return OmluCard(
                onTap: hasSession
                    ? () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => StaffBillScreen(tableId: t.id),
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
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) => Center(child: Text('Error: $err')),
      ),
    );
  }
}

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
          error: (err, st) =>
              Center(child: Text('Error loading staff accounts: $err')),
        ),
      ),
    );
  }
}
