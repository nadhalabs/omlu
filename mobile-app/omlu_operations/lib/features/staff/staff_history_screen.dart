import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../auth_provider.dart';

final staffOrderHistoryProvider = FutureProvider<Map<String, Object?>>((ref) {
  return ref.watch(operationsApiProvider).fetchOperationalOrderHistory();
});

class StaffHistoryScreen extends ConsumerWidget {
  const StaffHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(staffOrderHistoryProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('OMLU Staff · Today', style: OmluTypography.h2),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(staffOrderHistoryProvider.future),
        child: history.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(OmluSpacing.lg),
            children: [
              const Icon(
                Icons.history_toggle_off_rounded,
                size: 52,
                color: OmluColors.textSecondary,
              ),
              const SizedBox(height: OmluSpacing.md),
              Text(
                'Could not load operational history',
                textAlign: TextAlign.center,
                style: OmluTypography.h2,
              ),
              const SizedBox(height: OmluSpacing.xs),
              Text(
                '$error',
                textAlign: TextAlign.center,
                style: OmluTypography.bodyMedium,
              ),
              const SizedBox(height: OmluSpacing.md),
              FilledButton(
                onPressed: () => ref.invalidate(staffOrderHistoryProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
          data: (data) {
            final items = data['items'] as List? ?? const [];
            if (items.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(OmluSpacing.lg),
                children: const [
                  SizedBox(height: 120),
                  Icon(
                    Icons.receipt_long_rounded,
                    size: 52,
                    color: OmluColors.textSecondary,
                  ),
                  SizedBox(height: OmluSpacing.md),
                  Text(
                    'No completed orders today',
                    textAlign: TextAlign.center,
                    style: OmluTypography.h2,
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(OmluSpacing.md),
              itemCount: items.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(height: OmluSpacing.sm),
              itemBuilder: (context, index) {
                final order = Map<String, Object?>.from(items[index] as Map);
                return OmluCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              order['order_number']?.toString() ?? 'Order',
                              style: OmluTypography.h3,
                            ),
                            const SizedBox(height: OmluSpacing.xxs),
                            Text(
                              '${order['table_number'] ?? 'Table'} · ${order['status'] ?? ''}',
                              style: OmluTypography.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '₹${order['subtotal'] ?? '0.00'}',
                        style: OmluTypography.h3,
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
