import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/errors/user_facing_error.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';

final performanceProvider = FutureProvider.family<Map<String, Object?>, String>(
  (ref, preset) {
    ref.watch(authProvider).valueOrNull?.tenantScope;
    return ref
        .watch(operationsApiProvider)
        .fetchPerformanceSummary(preset: preset);
  },
);
final gstSummaryProvider = FutureProvider.family<Map<String, Object?>, String>((
  ref,
  preset,
) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchGstSummary(preset: preset);
});

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});
  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _preset = 'today';
  @override
  Widget build(BuildContext context) {
    final report = ref.watch(performanceProvider(_preset));
    final gst = ref.watch(gstSummaryProvider(_preset));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports & performance', style: OmluTypography.h2),
        actions: [
          IconButton(
            onPressed: () {
              ref.invalidate(performanceProvider(_preset));
              ref.invalidate(gstSummaryProvider(_preset));
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(performanceProvider(_preset));
          await ref.read(performanceProvider(_preset).future);
        },
        child: ListView(
          padding: const EdgeInsets.all(OmluSpacing.md),
          children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'today', label: Text('Today')),
                ButtonSegment(value: 'yesterday', label: Text('Yesterday')),
                ButtonSegment(value: 'last_7_days', label: Text('7 days')),
              ],
              selected: {_preset},
              onSelectionChanged: (v) => setState(() => _preset = v.first),
            ),
            const SizedBox(height: 16),
            report.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text(userFacingError(e)),
              data: (data) {
                final metrics = Map<String, Object?>.from(
                  data['metrics'] as Map? ?? data,
                );
                final cards = [
                  (
                    'Revenue',
                    '₹${metrics['total_revenue'] ?? '0.00'}',
                    Icons.currency_rupee,
                  ),
                  ('Orders', '${metrics['total_orders'] ?? 0}', Icons.receipt),
                  (
                    'Average order',
                    '₹${metrics['average_order_value'] ?? '0.00'}',
                    Icons.analytics,
                  ),
                  (
                    'Paid bills',
                    '${metrics['paid_bills'] ?? 0}',
                    Icons.payments,
                  ),
                  (
                    'Unpaid bills',
                    '${metrics['unpaid_bills'] ?? 0}',
                    Icons.pending_actions,
                  ),
                  (
                    'Avg. session',
                    '${metrics['average_session_duration_minutes'] ?? 0} min',
                    Icons.schedule,
                  ),
                ];
                return LayoutBuilder(
                  builder: (_, c) {
                    final revenue = _maps(data['revenue_by_day']);
                    final topItems = _maps(data['top_selling_items']);
                    final salesMix = _maps(data['sales_mix']);
                    final tables = _maps(data['table_usage']);
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        GridView.count(
                          crossAxisCount: c.maxWidth >= 900 ? 3 : 2,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          childAspectRatio: c.maxWidth < 600 ? 1.35 : 2.2,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          children: [
                            for (final card in cards)
                              Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(card.$3, color: OmluColors.accent),
                                      Text(card.$2, style: OmluTypography.h2),
                                      Text(
                                        card.$1,
                                        textAlign: TextAlign.center,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (revenue.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Text('Revenue trend', style: OmluTypography.h2),
                          _BarSeries(
                            items: revenue,
                            labelKeys: const ['date', 'day'],
                            valueKeys: const ['revenue', 'total_revenue'],
                          ),
                        ],
                        if (topItems.isNotEmpty || salesMix.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 20),
                            child: Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: [
                                if (topItems.isNotEmpty)
                                  _ReportTable(
                                    title: 'Top items',
                                    items: topItems,
                                  ),
                                if (salesMix.isNotEmpty)
                                  _ReportTable(
                                    title: 'Payment / sales mix',
                                    items: salesMix,
                                  ),
                              ],
                            ),
                          ),
                        if (tables.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          _ReportTable(
                            title: 'Table performance',
                            items: tables,
                          ),
                        ],
                      ],
                    );
                  },
                );
              },
            ),
            const SizedBox(height: 20),
            Text('GST summary', style: OmluTypography.h2),
            const SizedBox(height: 8),
            gst.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text(userFacingError(e)),
              data: (data) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Wrap(
                    spacing: 24,
                    runSpacing: 12,
                    children: [
                      for (final entry
                          in data.entries
                              .where((e) => e.value is num || e.value is String)
                              .take(8))
                        SizedBox(
                          width: 150,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.key.replaceAll('_', ' '),
                                style: OmluTypography.bodySmall,
                              ),
                              Text('${entry.value}', style: OmluTypography.h3),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

List<Map<String, Object?>> _maps(Object? value) => value is List
    ? [
        for (final item in value)
          if (item is Map) Map<String, Object?>.from(item),
      ]
    : const [];

class _BarSeries extends StatelessWidget {
  const _BarSeries({
    required this.items,
    required this.labelKeys,
    required this.valueKeys,
  });
  final List<Map<String, Object?>> items;
  final List<String> labelKeys;
  final List<String> valueKeys;
  @override
  Widget build(BuildContext context) {
    double number(Map<String, Object?> item) {
      for (final key in valueKeys) {
        final value = double.tryParse('${item[key] ?? ''}');
        if (value != null) return value;
      }
      return 0;
    }

    String label(Map<String, Object?> item) {
      for (final key in labelKeys) {
        if (item[key] != null) return '${item[key]}';
      }
      return '';
    }

    final maxValue = items.fold<double>(
      0,
      (max, item) => number(item) > max ? number(item) : max,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: SizedBox(
          height: 180,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final item in items.take(14))
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '₹${number(item).toStringAsFixed(0)}',
                          style: OmluTypography.bodySmall,
                          overflow: TextOverflow.fade,
                        ),
                        const SizedBox(height: 4),
                        Container(
                          height: maxValue == 0
                              ? 2
                              : 110 * number(item) / maxValue,
                          decoration: BoxDecoration(
                            color: OmluColors.accent,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          label(item),
                          style: OmluTypography.bodySmall,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportTable extends StatelessWidget {
  const _ReportTable({required this.title, required this.items});
  final String title;
  final List<Map<String, Object?>> items;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: MediaQuery.sizeOf(context).width >= 800 ? 380 : double.infinity,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: OmluTypography.h3),
            const Divider(),
            for (final item in items.take(8))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Expanded(child: Text('${item.values.firstOrNull ?? '—'}')),
                    Text(
                      '${item.values.skip(1).firstOrNull ?? ''}',
                      style: OmluTypography.bodyMedium,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
