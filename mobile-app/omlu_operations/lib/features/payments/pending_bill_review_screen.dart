import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_provider.dart';
import 'pending_payments_tab.dart';

final pendingBillProvider = FutureProvider.family<Map<String, Object?>, String>(
  (ref, number) => ref.watch(operationsApiProvider).fetchBill(number),
);

class PendingBillReviewScreen extends ConsumerWidget {
  const PendingBillReviewScreen({required this.billNumber, super.key});
  final String billNumber;

  Future<void> _confirm(
    BuildContext context,
    WidgetRef ref,
    String method,
  ) async {
    await ref
        .read(operationsApiProvider)
        .confirmCounterPayment(billNumber: billNumber, method: method);
    ref.invalidate(pendingBillProvider(billNumber));
    await ref.read(pendingPaymentsProvider.notifier).fetch(silent: true);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bill = ref.watch(pendingBillProvider(billNumber));
    return Scaffold(
      appBar: AppBar(title: const Text('Bill review')),
      body: RefreshIndicator(
        onRefresh: () async =>
            ref.refresh(pendingBillProvider(billNumber).future),
        child: bill.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [Text('$error')],
          ),
          data: (value) {
            final status = value['status']?.toString() ?? 'unknown';
            final pending = status == 'payment_pending';
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  'Table ${value['table_number'] ?? '—'}',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  '₹${value['total_amount'] ?? '0.00'}',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Text('Bill $billNumber'),
                Text('Session ${value['session_token'] ?? '—'}'),
                const SizedBox(height: 16),
                Chip(label: Text(status.replaceAll('_', ' '))),
                if (!pending)
                  const Text(
                    'This bill is no longer awaiting payment. Latest status is shown.',
                  ),
                if (pending) ...[
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => _confirm(context, ref, 'counter_cash'),
                    child: const Text('Confirm Cash received'),
                  ),
                  OutlinedButton(
                    onPressed: () => _confirm(context, ref, 'counter_upi'),
                    child: const Text('Confirm UPI received'),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
