import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/operations_models.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import 'pending_payments_tab.dart';

final pendingBillDetailProvider =
    FutureProvider.family<BillDetail, String>((ref, number) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  final api = ref.watch(operationsApiProvider);
  return api.fetchBillDetail(number);
});

class PendingBillReviewScreen extends ConsumerStatefulWidget {
  const PendingBillReviewScreen({required this.billNumber, super.key});

  final String billNumber;

  @override
  ConsumerState<PendingBillReviewScreen> createState() =>
      _PendingBillReviewScreenState();
}

class _PendingBillReviewScreenState
    extends ConsumerState<PendingBillReviewScreen> {
  bool _submitting = false;

  Future<void> _confirmPayment(BillDetail bill, String method) async {
    if (_submitting) return;

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

    final methodLabel = method == 'counter_upi' ? 'UPI' : 'Cash';
    final total = _money(bill.totalAmount);
    final table = bill.tableNumber.isEmpty ? '—' : bill.tableNumber;

    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Confirm $methodLabel payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Confirm $total received by $methodLabel for Table $table?',
                style: OmluTypography.bodyLarge),
            const SizedBox(height: OmluSpacing.xs),
            Text('Bill: ${bill.billNumber}', style: OmluTypography.bodyMedium),
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

    if (accepted != true || _submitting) return;
    setState(() => _submitting = true);

    try {
      final api = ref.read(operationsApiProvider);
      await api.confirmCounterPayment(
        billNumber: bill.billNumber,
        method: method,
        idempotencyKey: 'bill-payment-${bill.billNumber}-$method-v1',
      );

      ref.invalidate(pendingBillDetailProvider(widget.billNumber));
      await ref.read(pendingPaymentsProvider.notifier).fetch(silent: true);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Payment recorded successfully for Table $table.',
          ),
          backgroundColor: OmluColors.statusAvailable,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$error Latest bill status was loaded.'),
          backgroundColor: Colors.red.shade700,
        ),
      );
      ref.invalidate(pendingBillDetailProvider(widget.billNumber));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider).valueOrNull?.role.name;
    final isAuthorized = role == null || role == 'owner' || role == 'admin';
    final asyncValue = ref.watch(pendingBillDetailProvider(widget.billNumber));

    return Scaffold(
      appBar: AppBar(
        title: Text('Bill ${widget.billNumber}', style: OmluTypography.h2),
        actions: const [RealtimeStatusChip()],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pendingBillDetailProvider(widget.billNumber));
          await ref.read(pendingBillDetailProvider(widget.billNumber).future);
        },
        child: asyncValue.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: const [
              Center(child: CircularProgressIndicator()),
              SizedBox(height: OmluSpacing.md),
              Text(
                'Loading bill details…',
                textAlign: TextAlign.center,
                style: OmluTypography.bodyMedium,
              ),
            ],
          ),
          error: (error, _) => ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 64,
                color: Colors.red,
              ),
              const SizedBox(height: OmluSpacing.md),
              Text(
                'Could not load bill',
                textAlign: TextAlign.center,
                style: OmluTypography.h2,
              ),
              const SizedBox(height: OmluSpacing.xs),
              Text(
                '$error',
                textAlign: TextAlign.center,
                style: OmluTypography.bodyMedium,
              ),
              const SizedBox(height: OmluSpacing.lg),
              OmluButton(
                text: 'Retry',
                onPressed: () =>
                    ref.refresh(pendingBillDetailProvider(widget.billNumber)),
              ),
            ],
          ),
          data: (bill) => _buildBillContent(bill, isAuthorized),
        ),
      ),
    );
  }

  Widget _buildBillContent(BillDetail bill, bool isAuthorized) {
    final isPaid = bill.isPaid;
    final isPending = bill.isPaymentPending || bill.status == 'issued' || bill.status == 'draft';

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        OmluSpacing.md,
        OmluSpacing.sm,
        OmluSpacing.md,
        OmluSpacing.xxl,
      ),
      children: [
        // Header Card
        _BillHeaderCard(bill: bill),
        const SizedBox(height: OmluSpacing.md),

        // Order & Items Section
        Text('Ordered items', style: OmluTypography.h2),
        const SizedBox(height: OmluSpacing.xs),
        if (bill.orders.isEmpty)
          const OmluCard(
            child: Text(
              'No item lines recorded for this bill.',
              style: OmluTypography.bodyMedium,
            ),
          )
        else
          ...bill.orders.map((order) => _BillOrderCard(order: order)),

        const SizedBox(height: OmluSpacing.md),

        // Bill Summary Section
        _BillSummarySection(bill: bill),

        const SizedBox(height: OmluSpacing.md),

        // Payment Info & Actions Section
        if (isPaid) ...[
          OmluCard(
            color: OmluColors.statusAvailable.withValues(alpha: 0.08),
            borderColor: OmluColors.statusAvailable.withValues(alpha: 0.3),
            child: Column(
              children: [
                const Icon(
                  Icons.check_circle_rounded,
                  size: 48,
                  color: OmluColors.statusAvailable,
                ),
                const SizedBox(height: OmluSpacing.xs),
                Text('Payment recorded', style: OmluTypography.h2),
                const SizedBox(height: OmluSpacing.xxs),
                Text(
                  'Paid using ${_formatMethod(bill.paymentMethod)} on ${_formatDate(bill.paidAt)}',
                  style: OmluTypography.bodyMedium,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ] else if (isPending) ...[
          if (!isAuthorized) ...[
            OmluCard(
              color: Colors.amber.shade50,
              borderColor: Colors.amber.shade300,
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: Colors.amber.shade900),
                  const SizedBox(width: OmluSpacing.sm),
                  Expanded(
                    child: Text(
                      'You can view this bill, but only an owner or admin can confirm payment.',
                      style: OmluTypography.bodyMedium.copyWith(
                        color: Colors.amber.shade900,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            OmluCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Confirm payment', style: OmluTypography.h2),
                  const SizedBox(height: OmluSpacing.xs),
                  Text(
                    'Total due: ${_money(bill.totalAmount)}',
                    style: OmluTypography.h3.copyWith(color: OmluColors.accent),
                  ),
                  const SizedBox(height: OmluSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: OmluButton(
                          text: 'Confirm Cash received',
                          isLoading: _submitting,
                          onPressed: _submitting
                              ? null
                              : () => _confirmPayment(bill, 'counter_cash'),
                        ),
                      ),
                      const SizedBox(width: OmluSpacing.sm),
                      Expanded(
                        child: OmluButton(
                          text: 'Confirm UPI received',
                          isLoading: _submitting,
                          onPressed: _submitting
                              ? null
                              : () => _confirmPayment(bill, 'counter_upi'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _BillHeaderCard extends StatelessWidget {
  const _BillHeaderCard({required this.bill});
  final BillDetail bill;

  @override
  Widget build(BuildContext context) {
    return OmluCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 4,
            children: [
              Text(
                'Table ${bill.tableNumber.isEmpty ? '—' : bill.tableNumber}',
                style: OmluTypography.h1,
              ),
              _HumanStatusBadge(status: bill.status, sessionStatus: bill.sessionStatus),
            ],
          ),
          const SizedBox(height: OmluSpacing.xs),
          Text(
            'Bill #${bill.billNumber}',
            style: OmluTypography.bodyMedium.copyWith(color: OmluColors.textSecondary),
          ),
          if (bill.sentToCounterByRole != null) ...[
            const SizedBox(height: OmluSpacing.xxs),
            Text(
              'Sent to counter by ${bill.sentToCounterByRole}',
              style: OmluTypography.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _HumanStatusBadge extends StatelessWidget {
  const _HumanStatusBadge({required this.status, required this.sessionStatus});
  final String status;
  final String sessionStatus;

  @override
  Widget build(BuildContext context) {
    if (status == 'paid') {
      return const Chip(
        avatar: Icon(Icons.check_circle_rounded, size: 16, color: OmluColors.statusAvailable),
        label: Text('Paid', style: TextStyle(color: OmluColors.statusAvailable, fontWeight: FontWeight.bold)),
        backgroundColor: Color(0xFFDCFCE7),
      );
    }
    if (sessionStatus == 'detached_awaiting_payment' || status == 'payment_pending') {
      return const Chip(
        avatar: Icon(Icons.access_time_filled_rounded, size: 16, color: OmluColors.accentDark),
        label: Text('Waiting for payment', style: TextStyle(color: OmluColors.accentDark, fontWeight: FontWeight.bold)),
        backgroundColor: OmluColors.accentSoft,
      );
    }
    return Chip(
      avatar: const Icon(Icons.receipt_rounded, size: 16, color: OmluColors.textPrimary),
      label: Text(
        status == 'issued' ? 'Bill issued' : 'Bill draft',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _BillOrderCard extends StatelessWidget {
  const _BillOrderCard({required this.order});
  final BillDetailOrder order;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: OmluSpacing.sm),
      child: OmluCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  order.orderNumber.isEmpty ? 'Order' : 'Order #${order.orderNumber}',
                  style: OmluTypography.h3,
                ),
                const Spacer(),
                Text(_money(order.subtotal), style: OmluTypography.bodyLarge.copyWith(fontWeight: FontWeight.bold)),
              ],
            ),
            const Divider(height: OmluSpacing.md),
            ...order.items.map((item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${item.quantity} × ',
                            style: OmluTypography.bodyLarge.copyWith(fontWeight: FontWeight.bold),
                          ),
                          Expanded(
                            child: Text(item.itemName, style: OmluTypography.bodyLarge),
                          ),
                          Text(_money(item.lineTotal), style: OmluTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      if (item.selectedOptions.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 24, top: 2),
                          child: Text(
                            'Options: ${item.selectedOptions.map((o) => o.displayName).join(", ")}',
                            style: OmluTypography.bodySmall.copyWith(
                              color: OmluColors.accentDark,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      if (item.itemNote != null && item.itemNote!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(left: 24, top: 2),
                          child: Text(
                            'Note: ${item.itemNote}',
                            style: OmluTypography.bodySmall.copyWith(
                              fontStyle: FontStyle.italic,
                              color: OmluColors.textSecondary,
                            ),
                          ),
                        ),
                    ],
                  ),
                )),
            if (order.customerNote != null && order.customerNote!.isNotEmpty) ...[
              const SizedBox(height: OmluSpacing.xs),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: OmluColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Order Note: ${order.customerNote}',
                  style: OmluTypography.bodySmall.copyWith(fontStyle: FontStyle.italic),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BillSummarySection extends StatelessWidget {
  const _BillSummarySection({required this.bill});
  final BillDetail bill;

  @override
  Widget build(BuildContext context) {
    return OmluCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Bill summary', style: OmluTypography.h2),
          const SizedBox(height: OmluSpacing.md),
          if (bill.gstEnabled) ...[
            if (bill.legalBusinessName != null)
              Text(bill.legalBusinessName!, style: OmluTypography.bodyLarge.copyWith(fontWeight: FontWeight.bold)),
            if (bill.registeredBillingAddress != null)
              Text(bill.registeredBillingAddress!, style: OmluTypography.bodySmall),
            if (bill.gstin != null)
              Text('GSTIN: ${bill.gstin}', style: OmluTypography.bodySmall),
            if (bill.invoiceNumber != null)
              Text('Invoice: ${bill.invoiceNumber}', style: OmluTypography.bodySmall),
            const SizedBox(height: OmluSpacing.sm),
          ],
          _SummaryRow(label: 'Menu subtotal', amount: bill.subtotal),
          if (bill.discountAmount > 0)
            _SummaryRow(label: 'Discount', amount: -bill.discountAmount),
          if (bill.gstEnabled) ...[
            if (bill.taxableAmount != null)
              _SummaryRow(label: 'Taxable subtotal', amount: bill.taxableAmount!),
            if (bill.cgstAmount != null)
              _SummaryRow(label: 'CGST', amount: bill.cgstAmount!),
            if (bill.sgstAmount != null)
              _SummaryRow(label: 'SGST', amount: bill.sgstAmount!),
            if (bill.igstAmount != null && bill.igstAmount! > 0)
              _SummaryRow(label: 'IGST', amount: bill.igstAmount!),
          ] else if (bill.taxAmount > 0)
            _SummaryRow(label: 'Tax', amount: bill.taxAmount),

          const Divider(height: OmluSpacing.lg),
          _SummaryRow(
            label: 'Grand total',
            amount: bill.totalAmount,
            isBold: true,
            fontSize: 20,
            color: OmluColors.accentDark,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.amount,
    this.isBold = false,
    this.fontSize = 15,
    this.color,
  });

  final String label;
  final double amount;
  final bool isBold;
  final double fontSize;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
                color: color ?? OmluColors.textPrimary,
              ),
            ),
          ),
          Text(
            _money(amount),
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
              color: color ?? OmluColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

String _money(double value) {
  return '₹${value.toStringAsFixed(2)}';
}

String _formatMethod(String? method) {
  if (method == 'counter_upi') return 'UPI at counter';
  if (method == 'counter_cash') return 'Cash at counter';
  return method ?? 'Counter';
}

String _formatDate(DateTime? date) {
  if (date == null) return '—';
  final local = date.toLocal();
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  final ampm = local.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $ampm';
}
