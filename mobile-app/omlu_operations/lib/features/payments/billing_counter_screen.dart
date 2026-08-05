import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/role_session.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../auth_provider.dart';
import '../printing/printer_settings_screen.dart';
import 'pending_bill_review_screen.dart';

final billingCounterProvider = FutureProvider<Map<String, Object?>>((ref) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchBillingCounter();
});

class BillingCounterScreen extends ConsumerStatefulWidget {
  const BillingCounterScreen({required this.actorRole, super.key});

  final StaffRole actorRole;

  @override
  ConsumerState<BillingCounterScreen> createState() => _BillingCounterScreenState();
}

class _BillingCounterScreenState extends ConsumerState<BillingCounterScreen> {
  int _index = 0;

  List<Map<String, Object?>> _items(Map<String, Object?> data, String key) => [
    for (final value in (data[key] as List<Object?>? ?? const []))
      if (value is Map) Map<String, Object?>.from(value),
  ];

  @override
  Widget build(BuildContext context) {
    final queues = ref.watch(billingCounterProvider);
    const keys = ['requested', 'awaiting_payment', 'paid_recently'];
    const labels = ['Requested', 'Awaiting Payment', 'Paid'];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing Counter', style: OmluTypography.h2),
        actions: [
          if (widget.actorRole == StaffRole.owner ||
              widget.actorRole == StaffRole.admin)
            IconButton(
              tooltip: 'Printer setup',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const PrinterSettingsScreen(),
                ),
              ),
              icon: const Icon(Icons.print_rounded),
            ),
          IconButton(
            tooltip: 'Refresh billing counter',
            onPressed: () => ref.invalidate(billingCounterProvider),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: queues.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load billing counter: $error')),
        data: (data) {
          final counts = [for (final key in keys) _items(data, key).length];
          final items = _items(data, keys[_index]);
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(OmluSpacing.md),
                child: SegmentedButton<int>(
                  segments: [
                    for (var i = 0; i < labels.length; i++)
                      ButtonSegment(value: i, label: Text('${labels[i]} (${counts[i]})')),
                  ],
                  selected: {_index},
                  onSelectionChanged: (value) => setState(() => _index = value.first),
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.refresh(billingCounterProvider.future),
                  child: items.isEmpty
                      ? ListView(children: [
                          const SizedBox(height: 120),
                          Text('No bills in ${labels[_index].toLowerCase()}.', textAlign: TextAlign.center, style: OmluTypography.bodyLarge),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(OmluSpacing.md, 0, OmluSpacing.md, OmluSpacing.xxl),
                          itemCount: items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: OmluSpacing.sm),
                          itemBuilder: (context, index) => _BillingQueueCard(
                            item: items[index],
                            queueIndex: _index,
                            actorRole: widget.actorRole,
                          ),
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BillingQueueCard extends StatelessWidget {
  const _BillingQueueCard({required this.item, required this.queueIndex, required this.actorRole});
  final Map<String, Object?> item;
  final int queueIndex;
  final StaffRole actorRole;

  @override
  Widget build(BuildContext context) {
    final billNumber = item['bill_number']?.toString() ?? '';
    final total = double.tryParse(item['total_amount']?.toString() ?? '') ?? 0;
    final subtitle = queueIndex == 0
        ? '${item['item_count'] ?? 0} items · Provisional total'
        : queueIndex == 1
            ? '${item['invoice_number'] ?? billNumber} · Awaiting payment'
            : '${item['payment_method'] ?? 'Paid'} · ${item['paid_at'] ?? ''}';
    final action = queueIndex == 0 ? 'Review & Issue' : queueIndex == 1 ? 'Review & Collect Payment' : 'View & Print Receipt';
    return OmluCard(
      onTap: billNumber.isEmpty
          ? null
          : () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => PendingBillReviewScreen(billNumber: billNumber, actorRole: actorRole),
              )),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(child: Text('Table ${item['table_number'] ?? '—'}', style: OmluTypography.h2)),
            Text('₹${total.toStringAsFixed(2)}', style: OmluTypography.h2.copyWith(color: OmluColors.accent)),
          ]),
          const SizedBox(height: OmluSpacing.xs),
          Text(subtitle, style: OmluTypography.bodySmall),
          const SizedBox(height: OmluSpacing.sm),
          Text(action, style: OmluTypography.bodyMedium.copyWith(color: OmluColors.accent, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
