import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/app_icons.dart';
import '../auth_provider.dart';
import 'tables_screen.dart';
import 'new_order_screen.dart';
import 'requests_screen.dart';
import 'service_requests_provider.dart';
import 'staff_history_screen.dart';

final staffTabProvider = StateProvider<int>((ref) => 0);

class StaffShell extends ConsumerWidget {
  const StaffShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeTab = ref.watch(staffTabProvider);
    final activeRequestsCount = ref.watch(activeRequestsCountProvider);

    final List<Widget> screens = const [
      TablesScreen(),
      NewOrderScreen(),
      RequestsScreen(),
      StaffHistoryScreen(),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final isPhone = constraints.maxWidth < 600;

        Widget body = IndexedStack(index: activeTab, children: screens);

        if (isPhone) {
          return Scaffold(
            body: body,
            bottomNavigationBar: BottomNavigationBar(
              currentIndex: activeTab,
              selectedItemColor: OmluColors.accent,
              unselectedItemColor: OmluColors.textSecondary,
              onTap: (index) {
                ref.read(staffTabProvider.notifier).state = index;
              },
              items: [
                const BottomNavigationBarItem(
                  icon: Icon(OmluIcons.tables),
                  label: 'Tables',
                ),
                const BottomNavigationBarItem(
                  icon: Icon(OmluIcons.newOrder),
                  label: 'New Order',
                ),
                BottomNavigationBarItem(
                  icon: Badge(
                    label: Text('$activeRequestsCount'),
                    isLabelVisible: activeRequestsCount > 0,
                    backgroundColor: OmluColors.accent,
                    child: const Icon(OmluIcons.requests),
                  ),
                  label: 'Requests',
                ),
                const BottomNavigationBarItem(
                  icon: Icon(Icons.history_rounded),
                  label: 'History',
                ),
              ],
            ),
          );
        } else {
          // Tablet / Large screens: Navigation Rail
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: activeTab,
                  onDestinationSelected: (index) {
                    ref.read(staffTabProvider.notifier).state = index;
                  },
                  labelType: NavigationRailLabelType.all,
                  selectedIconTheme: const IconThemeData(
                    color: OmluColors.accent,
                  ),
                  unselectedIconTheme: const IconThemeData(
                    color: OmluColors.textSecondary,
                  ),
                  selectedLabelTextStyle: OmluTypography.label.copyWith(
                    color: OmluColors.accent,
                    fontWeight: FontWeight.bold,
                  ),
                  unselectedLabelTextStyle: OmluTypography.label,
                  destinations: [
                    const NavigationRailDestination(
                      icon: Icon(OmluIcons.tables),
                      label: Text('Tables'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(OmluIcons.newOrder),
                      label: Text('New Order'),
                    ),
                    NavigationRailDestination(
                      icon: Badge(
                        label: Text('$activeRequestsCount'),
                        isLabelVisible: activeRequestsCount > 0,
                        backgroundColor: OmluColors.accent,
                        child: const Icon(OmluIcons.requests),
                      ),
                      label: const Text('Requests'),
                    ),
                    const NavigationRailDestination(
                      icon: Icon(Icons.history_rounded),
                      label: Text('History'),
                    ),
                  ],
                  trailing: Expanded(
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: OmluSpacing.md),
                        child: IconButton(
                          icon: const Icon(
                            OmluIcons.logout,
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
                  thickness: 1,
                  width: 1,
                  color: OmluColors.border,
                ),
                Expanded(child: body),
              ],
            ),
          );
        }
      },
    );
  }
}
