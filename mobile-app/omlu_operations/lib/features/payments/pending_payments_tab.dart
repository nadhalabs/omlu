import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/operations_api.dart';
import '../../core/realtime/realtime_client.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import '../realtime_connection_provider.dart';
import 'payment_code_lookup_sheet.dart';
import 'pending_bill_review_screen.dart';

class PendingPaymentsNotifier
    extends StateNotifier<AsyncValue<List<Map<String, Object?>>>> {
  PendingPaymentsNotifier(this._api, Ref ref)
      : super(const AsyncValue.loading()) {
    fetch();
    ref.listen(realtimeEventStreamProvider, (previous, next) {
      next.whenData((event) {
        if (event.type == 'bill.payment_pending') {
          final number = event.state['bill_number']?.toString();
          final current = state.valueOrNull ?? const <Map<String, Object?>>[];
          if (number != null &&
              !current.any((item) => item['bill_number'] == number)) {
            state = AsyncValue.data([
              {
                ...event.state,
                'bill_number': number,
                'table_number': (event.state['table_name']?.toString() ?? '')
                    .replaceFirst(RegExp(r'^Table '), ''),
                'total_amount': event.state['grand_total'],
                'sent_by_staff_name': event.state['sent_by_name'],
              },
              ...current,
            ]);
          }
        }
        if ({
          'bill.sent_to_counter',
          'bill.payment_pending',
          'bill.payment_recorded',
          'bill.paid',
          'session.closed',
          'bill.cancelled',
          'bill.invalidated',
        }.contains(event.type)) {
          fetch(silent: true);
        }
      });
    });
    ref.listen(realtimeStateStreamProvider, (previous, next) {
      final before = previous?.valueOrNull;
      next.whenData((connection) {
        if (connection == RealtimeConnectionState.connected &&
            before != RealtimeConnectionState.connected) {
          fetch(silent: true);
        }
      });
    });
  }

  final OperationsApi _api;

  Future<void> fetch({bool silent = false}) async {
    if (!silent) state = const AsyncValue.loading();
    try {
      final items = await _api.fetchPendingPayments();
      state = AsyncValue.data([
        for (final item in items.whereType<Map>())
          Map<String, Object?>.from(item),
      ]);
    } catch (error, stack) {
      if (!silent) state = AsyncValue.error(error, stack);
    }
  }
}

final pendingPaymentsProvider = StateNotifierProvider<PendingPaymentsNotifier,
    AsyncValue<List<Map<String, Object?>>>>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return PendingPaymentsNotifier(ref.watch(operationsApiProvider), ref);
});

final pendingPaymentsCountProvider = Provider<int>(
  (ref) => ref.watch(pendingPaymentsProvider).valueOrNull?.length ?? 0,
);

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

    final role = ref.read(authProvider).valueOrNull?.role.name;
    if (role == 'staff') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'You can view this bill, but only an owner or admin can confirm payment.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final amount = _money(payment['total_amount']);
    final table = payment['table_number']?.toString() ?? '—';
    final methodLabel = method == 'counter_upi' ? 'UPI' : 'Cash';

    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Confirm $methodLabel payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Confirm $amount received by $methodLabel for Table $table?',
                style: OmluTypography.bodyLarge),
            const SizedBox(height: OmluSpacing.xs),
            Text('Bill: $billNumber', style: OmluTypography.bodyMedium),
            const SizedBox(height: OmluSpacing.md),
            const Text(
              'Confirm only after receiving the full amount.',
              style: OmluTypography.bodySmall,
            ),
          ],
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
      await ref.read(operationsApiProvider).confirmCounterPayment(
            billNumber: billNumber,
            method: method,
            idempotencyKey: 'bill-payment-$billNumber-$method-v1',
          );
      await ref.read(pendingPaymentsProvider.notifier).fetch(silent: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$methodLabel payment recorded for Table $table.'),
          backgroundColor: OmluColors.statusAvailable,
        ),
      );
    } catch (error) {
      await ref.read(pendingPaymentsProvider.notifier).fetch(silent: true);
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
    final payments = ref.watch(pendingPaymentsProvider);
    final role = ref.watch(authProvider).valueOrNull?.role.name;
    final isAuthorized = role == null || role == 'owner' || role == 'admin';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pending payments', style: OmluTypography.h2),
        actions: const [RealtimeStatusChip()],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(pendingPaymentsProvider.notifier).fetch(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(OmluSpacing.md),
          children: [
            // Top Section
            OmluCard(
              color: OmluColors.accentSoft,
              borderColor: OmluColors.accent.withValues(alpha: 0.3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.payments_rounded,
                        color: OmluColors.accentDark,
                        size: 28,
                      ),
                      const SizedBox(width: OmluSpacing.sm),
                      Expanded(
                        child: Text(
                          'Bills waiting at counter',
                          style: OmluTypography.h3.copyWith(
                            color: OmluColors.accentDark,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: OmluSpacing.xs),
                  const Text(
                    'Customers can pay at the counter or show their 6-character code.',
                    style: OmluTypography.bodyMedium,
                  ),
                  const SizedBox(height: OmluSpacing.md),
                  OmluButton(
                    text: 'Find bill by code',
                    onPressed: () => PaymentCodeLookupSheet.show(context),
                  ),
                ],
              ),
            ),
            const SizedBox(height: OmluSpacing.lg),

            // Queue Content
            payments.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(OmluSpacing.xl),
                child: Center(
                  child: Column(
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: OmluSpacing.md),
                      Text('Loading pending payments…', style: OmluTypography.bodyMedium),
                    ],
                  ),
                ),
              ),
              error: (error, stack) => OmluCard(
                color: Colors.red.shade50,
                borderColor: Colors.red.shade200,
                child: Column(
                  children: [
                    Icon(Icons.wifi_off_rounded, size: 48, color: Colors.red.shade700),
                    const SizedBox(height: OmluSpacing.sm),
                    Text(
                      'Could not connect to OMLU',
                      style: OmluTypography.h3.copyWith(color: Colors.red.shade900),
                    ),
                    const SizedBox(height: OmluSpacing.xs),
                    Text(
                      'Pending bill information may be out of date. Check your connection.',
                      textAlign: TextAlign.center,
                      style: OmluTypography.bodySmall,
                    ),
                    const SizedBox(height: OmluSpacing.md),
                    OmluButton(
                      text: 'Retry',
                      onPressed: () => ref.read(pendingPaymentsProvider.notifier).fetch(),
                    ),
                  ],
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(OmluSpacing.xl),
                    child: Column(
                      children: [
                        Icon(
                          Icons.check_circle_rounded,
                          size: 64,
                          color: OmluColors.statusAvailable,
                        ),
                        SizedBox(height: OmluSpacing.md),
                        Text(
                          'No payments waiting',
                          textAlign: TextAlign.center,
                          style: OmluTypography.h2,
                        ),
                        SizedBox(height: OmluSpacing.xs),
                        Text(
                          'All counter bills have been paid.',
                          textAlign: TextAlign.center,
                          style: OmluTypography.bodyMedium,
                        ),
                      ],
                    ),
                  );
                }

                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: OmluSpacing.md),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final billNumber = item['bill_number']?.toString() ?? '';
                    final busy = _confirmingBill == billNumber;

                    return _PendingPaymentCard(
                      item: item,
                      billNumber: billNumber,
                      busy: busy,
                      isAuthorized: isAuthorized,
                      onViewBill: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => PendingBillReviewScreen(
                            billNumber: billNumber,
                          ),
                        ),
                      ),
                      onConfirmCash: () => _confirm(item, 'counter_cash'),
                      onConfirmUpi: () => _confirm(item, 'counter_upi'),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingPaymentCard extends StatelessWidget {
  const _PendingPaymentCard({
    required this.item,
    required this.billNumber,
    required this.busy,
    required this.isAuthorized,
    required this.onViewBill,
    required this.onConfirmCash,
    required this.onConfirmUpi,
  });

  final Map<String, Object?> item;
  final String billNumber;
  final bool busy;
  final bool isAuthorized;
  final VoidCallback onViewBill;
  final VoidCallback onConfirmCash;
  final VoidCallback onConfirmUpi;

  @override
  Widget build(BuildContext context) {
    final tableNumber = item['table_number']?.toString() ?? '—';
    final amount = _money(item['total_amount']);
    final requestedAt = _when(item['requested_at']);
    final sentBy = item['sent_by_staff_name']?.toString() ?? 'Staff';

    return OmluCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Table $tableNumber', style: OmluTypography.h1),
              ),
              Text(
                amount,
                style: OmluTypography.h1.copyWith(color: OmluColors.accentDark),
              ),
            ],
          ),
          const SizedBox(height: OmluSpacing.xs),
          Row(
            children: [
              const Chip(
                avatar: Icon(Icons.access_time_filled_rounded, size: 14, color: OmluColors.accentDark),
                label: Text('Waiting for payment', style: TextStyle(color: OmluColors.accentDark, fontWeight: FontWeight.bold)),
                backgroundColor: OmluColors.accentSoft,
              ),
              const Spacer(),
              if (billNumber.isNotEmpty)
                Text('Bill #$billNumber', style: OmluTypography.bodySmall),
            ],
          ),
          const SizedBox(height: OmluSpacing.xs),
          Text(
            'Sent by $sentBy',
            style: OmluTypography.bodyMedium,
          ),
          const SizedBox(height: 2),
          Text(
            'Requested $requestedAt',
            style: OmluTypography.bodySmall,
          ),
          const SizedBox(height: OmluSpacing.md),

          // Primary Actions
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy ? null : onViewBill,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('View bill', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
          if (isAuthorized) ...[
            const SizedBox(height: OmluSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OmluButton(
                    text: 'Confirm Cash received',
                    isLoading: busy,
                    onPressed: busy ? null : onConfirmCash,
                  ),
                ),
                const SizedBox(width: OmluSpacing.sm),
                Expanded(
                  child: OmluButton(
                    text: 'Confirm UPI received',
                    isLoading: busy,
                    onPressed: busy ? null : onConfirmUpi,
                  ),
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: OmluSpacing.xs),
            const Text(
              'Only owner or admin can confirm payment.',
              style: OmluTypography.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

String _money(Object? value) {
  final amount = double.tryParse(value?.toString() ?? '') ?? 0;
  return '₹${amount.toStringAsFixed(2)}';
}

String _when(Object? value) {
  final parsed = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (parsed == null) return '—';
  final hour = parsed.hour % 12 == 0 ? 12 : parsed.hour % 12;
  final minute = parsed.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${parsed.hour >= 12 ? 'PM' : 'AM'}';
}
