import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_skeleton_loader.dart';
import '../../design_system/widgets/realtime_status_chip.dart';
import '../auth_provider.dart';
import 'menu_provider.dart';
import 'tables_provider.dart';

class StaffBillScreen extends ConsumerStatefulWidget {
  const StaffBillScreen({required this.tableId, super.key});

  final int tableId;

  @override
  ConsumerState<StaffBillScreen> createState() => _StaffBillScreenState();
}

class _StaffBillScreenState extends ConsumerState<StaffBillScreen> {
  bool _submitting = false;
  Map<String, Object?>? _confirmedBill;

  Future<void> _refresh() async {
    ref.invalidate(tableDetailProvider(widget.tableId));
    await ref.read(tableDetailProvider(widget.tableId).future);
  }

  Future<void> _generateBill() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Generate final bill?'),
        content: const Text(
          'The backend will recalculate every valid order and lock the bill total for payment.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Generate bill'),
          ),
        ],
      ),
    );
    if (confirmed != true || _submitting) return;
    setState(() => _submitting = true);
    try {
      await ref.read(operationsApiProvider).generateTableBill(widget.tableId);
      await _refresh();
    } catch (error) {
      await _handleFailure(error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _acceptPayment(Map<String, Object?> bill) async {
    if (_submitting) return;
    final method = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => _PaymentConfirmationSheet(bill: bill),
    );
    if (method == null || _submitting) return;

    setState(() => _submitting = true);
    try {
      final api = ref.read(operationsApiProvider);
      var latest = bill;
      final billNumber = _text(bill['bill_number']);
      if (_text(bill['status']) == 'draft') {
        latest = await api.issueBill(billNumber);
      }
      final paid = await api.confirmCounterPayment(
        billNumber: _text(latest['bill_number']),
        method: method,
      );
      if (!mounted) return;
      setState(() => _confirmedBill = paid);
      ref.invalidate(tableDetailProvider(widget.tableId));
      await ref.read(tablesProvider.notifier).fetchTables(silent: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Payment confirmed. Session closed and table is now free.',
          ),
          backgroundColor: OmluColors.statusAvailable,
        ),
      );
    } catch (error) {
      await _handleFailure(error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _handleFailure(Object error) async {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$error Latest table state has been loaded.'),
        backgroundColor: Colors.red.shade700,
      ),
    );
    try {
      await _refresh();
    } catch (_) {
      // The original actionable error remains visible.
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider).valueOrNull?.role.name ?? 'staff';
    final paid = _confirmedBill;
    return Scaffold(
      appBar: AppBar(
        title: Text('OMLU ${_title(role)} · Bill', style: OmluTypography.h2),
        actions: const [RealtimeStatusChip()],
      ),
      body: paid != null
          ? _PaidBillView(bill: paid, onDone: () => Navigator.of(context).pop())
          : ref
                .watch(tableDetailProvider(widget.tableId))
                .when(
                  loading: () => ListView(
                    padding: const EdgeInsets.all(OmluSpacing.md),
                    children: const [
                      OmluSkeletonLoader(width: double.infinity, height: 120),
                      SizedBox(height: OmluSpacing.md),
                      OmluSkeletonLoader(width: double.infinity, height: 260),
                    ],
                  ),
                  error: (error, stack) =>
                      _ErrorState(message: '$error', onRetry: _refresh),
                  data: (detail) => _buildDetail(detail),
                ),
    );
  }

  Widget _buildDetail(Map<String, Object?> detail) {
    final table = _map(detail['table']);
    final session = detail['session'] is Map ? _map(detail['session']) : null;
    if (session == null) {
      return const _EmptyState(
        icon: Icons.table_restaurant_rounded,
        title: 'No active session',
        message: 'This table is free. Payment actions are no longer available.',
      );
    }
    final bill = session['bill'] is Map ? _map(session['bill']) : null;
    final orders = _listOfMaps(session['orders']);
    final activity = _listOfMaps(detail['activity']);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          OmluSpacing.md,
          OmluSpacing.sm,
          OmluSpacing.md,
          OmluSpacing.xxl,
        ),
        children: [
          _SessionHeader(
            tableNumber: _text(table['table_number'], fallback: 'Table'),
            openedAt: _date(session['opened_at']),
            status: _text(session['status'], fallback: 'open'),
          ),
          const SizedBox(height: OmluSpacing.lg),
          Text('Orders', style: OmluTypography.h2),
          const SizedBox(height: OmluSpacing.sm),
          if (orders.isEmpty)
            const _EmptyCard(message: 'No billable orders in this session.')
          else
            ...orders.map(
              (order) => Padding(
                padding: const EdgeInsets.only(bottom: OmluSpacing.sm),
                child: _OrderBillCard(order: order),
              ),
            ),
          const SizedBox(height: OmluSpacing.sm),
          if (bill == null)
            OmluCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Bill not generated', style: OmluTypography.h3),
                  const SizedBox(height: OmluSpacing.xs),
                  const Text(
                    'Generate the bill when ordering is complete. Totals are calculated by the backend.',
                    style: OmluTypography.bodyMedium,
                  ),
                  const SizedBox(height: OmluSpacing.md),
                  OmluButton(
                    text: 'Generate Bill',
                    isLoading: _submitting,
                    onPressed: orders.isEmpty || _submitting
                        ? null
                        : _generateBill,
                  ),
                ],
              ),
            )
          else
            _BillBreakdown(
              bill: bill,
              isSubmitting: _submitting,
              onAcceptPayment: () => _acceptPayment(bill),
            ),
          if (activity.isNotEmpty) ...[
            const SizedBox(height: OmluSpacing.lg),
            Text('Session timeline', style: OmluTypography.h2),
            const SizedBox(height: OmluSpacing.sm),
            OmluCard(child: _Timeline(events: activity)),
          ],
        ],
      ),
    );
  }
}

class _SessionHeader extends StatelessWidget {
  const _SessionHeader({
    required this.tableNumber,
    required this.openedAt,
    required this.status,
  });
  final String tableNumber;
  final DateTime? openedAt;
  final String status;

  @override
  Widget build(BuildContext context) {
    final minutes = openedAt == null
        ? null
        : DateTime.now().difference(openedAt!).inMinutes;
    return OmluCard(
      color: OmluColors.accent.withValues(alpha: 0.06),
      borderColor: OmluColors.accent.withValues(alpha: 0.2),
      child: Row(
        children: [
          const Icon(
            Icons.table_restaurant_rounded,
            color: OmluColors.accent,
            size: 32,
          ),
          const SizedBox(width: OmluSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Table $tableNumber', style: OmluTypography.h1),
                const SizedBox(height: OmluSpacing.xxs),
                Text(
                  minutes == null
                      ? 'Active dining session'
                      : 'Session opened $minutes minutes ago',
                  style: OmluTypography.bodyMedium,
                ),
              ],
            ),
          ),
          _StatusLabel(text: _displayStatus(status)),
        ],
      ),
    );
  }
}

class _OrderBillCard extends StatelessWidget {
  const _OrderBillCard({required this.order});
  final Map<String, Object?> order;

  @override
  Widget build(BuildContext context) {
    final items = _listOfMaps(order['items']);
    final cancelled = {
      'rejected',
      'cancelled',
    }.contains(_text(order['status']));
    return OmluCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _text(order['order_number'], fallback: 'Order'),
                  style: OmluTypography.h3,
                ),
              ),
              _StatusLabel(
                text: cancelled
                    ? 'Cancelled'
                    : _displayStatus(_text(order['status'])),
                danger: cancelled,
              ),
            ],
          ),
          const SizedBox(height: OmluSpacing.sm),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.symmetric(vertical: OmluSpacing.xxs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 36,
                    child: Text(
                      '${_int(item['quantity'])} ×',
                      style: OmluTypography.bodyMedium,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _text(item['item_name']),
                      style: OmluTypography.bodyMedium,
                    ),
                  ),
                  Text(
                    _money(_amount(item['total_price'])),
                    style: OmluTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (cancelled) ...[
            const SizedBox(height: OmluSpacing.xs),
            const Text(
              'Excluded from bill total',
              style: TextStyle(color: Colors.red),
            ),
          ],
        ],
      ),
    );
  }
}

class _BillBreakdown extends StatelessWidget {
  const _BillBreakdown({
    required this.bill,
    required this.isSubmitting,
    required this.onAcceptPayment,
  });
  final Map<String, Object?> bill;
  final bool isSubmitting;
  final VoidCallback onAcceptPayment;

  @override
  Widget build(BuildContext context) {
    final status = _text(bill['status']);
    final total = _amount(bill['total_amount']);
    final paid = status == 'paid' ? total : 0.0;
    final balance = total - paid;
    return OmluCard(
      borderColor: OmluColors.statusOrdering.withValues(alpha: 0.25),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Bill ${_text(bill['bill_number'])}',
                  style: OmluTypography.h2,
                ),
              ),
              _StatusLabel(text: status == 'paid' ? 'Paid' : 'Unpaid'),
            ],
          ),
          const SizedBox(height: OmluSpacing.md),
          _MoneyRow(label: 'Subtotal', value: _amount(bill['subtotal'])),
          _MoneyRow(label: 'Tax', value: _amount(bill['tax_amount'])),
          const _MoneyRow(label: 'Service charge', value: 0),
          _MoneyRow(
            label: 'Discount',
            value: -_amount(bill['discount_amount']),
          ),
          const Divider(height: OmluSpacing.lg),
          _MoneyRow(label: 'Grand total', value: total, strong: true),
          _MoneyRow(label: 'Paid', value: paid),
          _MoneyRow(label: 'Balance', value: balance, strong: true),
          if (status == 'paid') ...[
            const SizedBox(height: OmluSpacing.md),
            _PaymentHistory(bill: bill),
          ] else ...[
            const SizedBox(height: OmluSpacing.md),
            OmluButton(
              text: 'Accept Full Payment · ${_money(total)}',
              isLoading: isSubmitting,
              onPressed: isSubmitting ? null : onAcceptPayment,
            ),
            const SizedBox(height: OmluSpacing.xs),
            const Text(
              'Manual counter confirmation only. No online payment is initiated.',
              textAlign: TextAlign.center,
              style: OmluTypography.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _PaymentConfirmationSheet extends StatefulWidget {
  const _PaymentConfirmationSheet({required this.bill});
  final Map<String, Object?> bill;

  @override
  State<_PaymentConfirmationSheet> createState() =>
      _PaymentConfirmationSheetState();
}

class _PaymentConfirmationSheetState extends State<_PaymentConfirmationSheet> {
  String _method = 'counter_cash';

  @override
  Widget build(BuildContext context) {
    final total = _amount(widget.bill['total_amount']);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          OmluSpacing.md,
          0,
          OmluSpacing.md,
          OmluSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Confirm payment received', style: OmluTypography.h2),
            const SizedBox(height: OmluSpacing.xs),
            Text(
              'Full balance: ${_money(total)}',
              style: OmluTypography.h1.copyWith(color: OmluColors.accent),
            ),
            const SizedBox(height: OmluSpacing.md),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'counter_cash',
                  icon: Icon(Icons.payments_rounded),
                  label: Text('Cash'),
                ),
                ButtonSegment(
                  value: 'counter_upi',
                  icon: Icon(Icons.qr_code_rounded),
                  label: Text('UPI'),
                ),
              ],
              selected: {_method},
              onSelectionChanged: (selection) =>
                  setState(() => _method = selection.first),
            ),
            const SizedBox(height: OmluSpacing.md),
            Text(
              _method == 'counter_upi'
                  ? 'Confirm only after the restaurant sees the UPI payment in its own account.'
                  : 'Confirm only after the full cash amount has been received.',
              style: OmluTypography.bodyMedium,
            ),
            const SizedBox(height: OmluSpacing.lg),
            OmluButton(
              text:
                  'Confirm ${_method == 'counter_upi' ? 'UPI' : 'Cash'} · ${_money(total)}',
              onPressed: () => Navigator.pop(context, _method),
            ),
            const SizedBox(height: OmluSpacing.xs),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaidBillView extends StatelessWidget {
  const _PaidBillView({required this.bill, required this.onDone});
  final Map<String, Object?> bill;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(OmluSpacing.md),
      children: [
        const Icon(
          Icons.check_circle_rounded,
          size: 72,
          color: OmluColors.statusAvailable,
        ),
        const SizedBox(height: OmluSpacing.md),
        Text(
          'Payment recorded',
          textAlign: TextAlign.center,
          style: OmluTypography.h1,
        ),
        const SizedBox(height: OmluSpacing.xs),
        const Text(
          'The backend confirmed payment, closed the session, and released the table.',
          textAlign: TextAlign.center,
          style: OmluTypography.bodyMedium,
        ),
        const SizedBox(height: OmluSpacing.lg),
        OmluCard(child: _PaymentHistory(bill: bill)),
        const SizedBox(height: OmluSpacing.lg),
        OmluButton(text: 'Back to Tables', onPressed: onDone),
      ],
    );
  }
}

class _PaymentHistory extends StatelessWidget {
  const _PaymentHistory({required this.bill});
  final Map<String, Object?> bill;

  @override
  Widget build(BuildContext context) {
    final method = _text(bill['payment_method']) == 'counter_upi'
        ? 'UPI at counter'
        : 'Cash at counter';
    final paidAt = _date(bill['paid_at']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Payment history', style: OmluTypography.h3),
        const SizedBox(height: OmluSpacing.sm),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const CircleAvatar(
            backgroundColor: OmluColors.background,
            child: Icon(Icons.receipt_long_rounded, color: OmluColors.accent),
          ),
          title: Text('${_money(_amount(bill['total_amount']))} · $method'),
          subtitle: Text(
            paidAt == null
                ? 'Confirmed by restaurant staff'
                : _formatDate(paidAt),
          ),
          trailing: const Icon(
            Icons.verified_rounded,
            color: OmluColors.statusAvailable,
          ),
        ),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events});
  final List<Map<String, Object?>> events;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var index = 0; index < events.length; index++)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  const Icon(Icons.circle, size: 11, color: OmluColors.accent),
                  if (index < events.length - 1)
                    Container(width: 2, height: 38, color: OmluColors.divider),
                ],
              ),
              const SizedBox(width: OmluSpacing.sm),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: OmluSpacing.sm),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _text(events[index]['label']),
                        style: OmluTypography.bodyMedium,
                      ),
                      if (_date(events[index]['timestamp'])
                          case final timestamp?)
                        Text(
                          _formatDate(timestamp),
                          style: OmluTypography.bodySmall,
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.value,
    this.strong = false,
  });
  final String label;
  final double value;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: OmluSpacing.xxs),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: strong ? OmluTypography.h3 : OmluTypography.bodyMedium,
          ),
        ),
        Text(
          _money(value),
          style: strong ? OmluTypography.h3 : OmluTypography.bodyMedium,
        ),
      ],
    ),
  );
}

class _StatusLabel extends StatelessWidget {
  const _StatusLabel({required this.text, this.danger = false});
  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: (danger ? Colors.red : OmluColors.statusOrdering).withValues(
        alpha: 0.1,
      ),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      text,
      style: OmluTypography.label.copyWith(
        color: danger ? Colors.red : OmluColors.statusOrdering,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            size: 52,
            color: OmluColors.textSecondary,
          ),
          const SizedBox(height: OmluSpacing.md),
          Text('Could not load the latest bill', style: OmluTypography.h2),
          const SizedBox(height: OmluSpacing.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: OmluTypography.bodyMedium,
          ),
          const SizedBox(height: OmluSpacing.md),
          OmluButton(text: 'Retry', isFullWidth: false, onPressed: onRetry),
        ],
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 52, color: OmluColors.textSecondary),
          const SizedBox(height: OmluSpacing.md),
          Text(title, style: OmluTypography.h2),
          const SizedBox(height: OmluSpacing.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: OmluTypography.bodyMedium,
          ),
        ],
      ),
    ),
  );
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) =>
      OmluCard(child: Text(message, style: OmluTypography.bodyMedium));
}

Map<String, Object?> _map(Object? value) =>
    Map<String, Object?>.from(value as Map);
List<Map<String, Object?>> _listOfMaps(Object? value) => [
  for (final item in value as List? ?? const [])
    Map<String, Object?>.from(item as Map),
];
String _text(Object? value, {String fallback = ''}) =>
    value?.toString() ?? fallback;
int _int(Object? value) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? 0;
double _amount(Object? value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
String _money(double value) => '₹${value.toStringAsFixed(2)}';
DateTime? _date(Object? value) =>
    value == null ? null : DateTime.tryParse('$value')?.toLocal();
String _formatDate(DateTime value) =>
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')} · ${value.day}/${value.month}/${value.year}';
String _title(String role) =>
    role.isEmpty ? 'Staff' : '${role[0].toUpperCase()}${role.substring(1)}';
String _displayStatus(String status) => switch (status) {
  'pending' || 'accepted' => 'Received',
  'preparing' => 'Preparing',
  'ready' => 'Ready',
  'served' => 'Served',
  'payment_requested' => 'Bill requested',
  'payment_pending' => 'Payment pending',
  'closed' => 'Closed',
  _ => _title(status),
};
