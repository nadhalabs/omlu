import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';
import '../staff/staff_bill_screen.dart';

final pendingPaymentsProvider = FutureProvider<List<Map<String, Object?>>>((
  ref,
) async {
  final items = await ref.watch(operationsApiProvider).fetchPendingPayments();
  return items
      .whereType<Map>()
      .map((item) => Map<String, Object?>.from(item))
      .toList();
});

class PendingPaymentsTab extends ConsumerStatefulWidget {
  const PendingPaymentsTab({super.key});

  @override
  ConsumerState<PendingPaymentsTab> createState() => _PendingPaymentsTabState();
}

class _PendingPaymentsTabState extends ConsumerState<PendingPaymentsTab> {
  String? _confirmingBill;

  Future<void> _confirm(Map<String, Object?> payment, String method) async {
    final billNumber = payment['bill_number']?.toString() ?? '';
    if (billNumber.isEmpty || _confirmingBill != null) return;
    final amount = _money(payment['total_amount']);
    final table = payment['table_number']?.toString() ?? '—';
    final methodLabel = method == 'counter_upi' ? 'UPI' : 'Cash';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Confirm $methodLabel received?'),
        content: Text(
          'Confirm $amount received by $methodLabel for Table $table? The session will close and the table will become Free.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text('Confirm $methodLabel received'),
          ),
        ],
      ),
    );
    if (accepted != true || _confirmingBill != null) return;
    setState(() => _confirmingBill = billNumber);
    try {
      await ref
          .read(operationsApiProvider)
          .confirmCounterPayment(billNumber: billNumber, method: method);
      ref.invalidate(pendingPaymentsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$methodLabel payment confirmed for Table $table.'),
          backgroundColor: OmluColors.statusAvailable,
        ),
      );
    } catch (error) {
      ref.invalidate(pendingPaymentsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$error Latest payment state was loaded.')),
      );
    } finally {
      if (mounted) setState(() => _confirmingBill = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventStreamProvider, (previous, next) {
      next.whenData((event) {
        if ({
          'bill.sent_to_counter',
          'bill.payment_pending',
          'bill.payment_recorded',
          'bill.paid',
          'session.closed',
        }.contains(event.type)) {
          ref.invalidate(pendingPaymentsProvider);
        }
      });
    });
    final payments = ref.watch(pendingPaymentsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pending payments', style: OmluTypography.h2),
        actions: const [RealtimeStatusChip()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(pendingPaymentsProvider.future),
        child: payments.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: [
              Text('Could not load pending payments: $error'),
              const SizedBox(height: OmluSpacing.md),
              OmluButton(
                text: 'Retry',
                onPressed: () => ref.invalidate(pendingPaymentsProvider),
              ),
            ],
          ),
          data: (items) => items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(OmluSpacing.xl),
                  children: const [
                    Icon(
                      Icons.verified_rounded,
                      size: 64,
                      color: OmluColors.statusAvailable,
                    ),
                    SizedBox(height: OmluSpacing.md),
                    Text(
                      'No payments waiting',
                      textAlign: TextAlign.center,
                      style: OmluTypography.h2,
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(OmluSpacing.md),
                  itemCount: items.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: OmluSpacing.md),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final billNumber = item['bill_number']?.toString() ?? '';
                    final busy = _confirmingBill == billNumber;
                    final tableId = int.tryParse(
                      item['table_id']?.toString() ?? '',
                    );
                    return OmluCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Table ${item['table_number'] ?? '—'}',
                                  style: OmluTypography.h2,
                                ),
                              ),
                              Text(
                                _money(item['total_amount']),
                                style: OmluTypography.h2.copyWith(
                                  color: OmluColors.accent,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: OmluSpacing.xs),
                          Text('Session ${_short(item['session_token'])}'),
                          Text(
                            'Requested ${_when(item['requested_at'])}',
                            style: OmluTypography.bodySmall,
                          ),
                          Text(
                            'Sent by ${item['sent_by_staff_name'] ?? 'Staff'}',
                            style: OmluTypography.bodySmall,
                          ),
                          const SizedBox(height: OmluSpacing.xs),
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Chip(label: Text('Payment pending')),
                          ),
                          const SizedBox(height: OmluSpacing.md),
                          if (tableId != null)
                            OutlinedButton(
                              onPressed: busy
                                  ? null
                                  : () => Navigator.of(context).push(
                                      MaterialPageRoute<void>(
                                        builder: (_) =>
                                            StaffBillScreen(tableId: tableId),
                                      ),
                                    ),
                              child: const Text('View bill'),
                            ),
                          const SizedBox(height: OmluSpacing.xs),
                          Row(
                            children: [
                              Expanded(
                                child: OmluButton(
                                  text: 'Confirm Cash received',
                                  isLoading: busy,
                                  onPressed: busy
                                      ? null
                                      : () => _confirm(item, 'counter_cash'),
                                ),
                              ),
                              const SizedBox(width: OmluSpacing.sm),
                              Expanded(
                                child: OmluButton(
                                  text: 'Confirm UPI received',
                                  isLoading: busy,
                                  onPressed: busy
                                      ? null
                                      : () => _confirm(item, 'counter_upi'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

String _money(Object? value) {
  final amount = double.tryParse(value?.toString() ?? '') ?? 0;
  return '₹${amount.toStringAsFixed(2)}';
}

String _short(Object? value) {
  final text = value?.toString() ?? '—';
  return text.length <= 8 ? text : '${text.substring(0, 8)}…';
}

String _when(Object? value) {
  final parsed = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (parsed == null) return '—';
  final hour = parsed.hour % 12 == 0 ? 12 : parsed.hour % 12;
  final minute = parsed.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${parsed.hour >= 12 ? 'PM' : 'AM'}';
}
