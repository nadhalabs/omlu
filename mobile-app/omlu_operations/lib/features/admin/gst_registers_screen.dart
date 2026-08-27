import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/errors/user_facing_error.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';

const _gstResources = <String, String>{
  'sales-register': 'Sales register',
  'rate-summary': 'Rate summary',
  'hsn-summary': 'HSN summary',
  'b2b-register': 'B2B register',
  'b2c-register': 'B2C register',
  'documents-issued': 'Documents issued',
  'cancelled-documents': 'Cancelled documents',
};

final gstRegisterProvider =
    FutureProvider.family<Map<String, Object?>, (String, String, int)>((
      ref,
      key,
    ) {
      ref.watch(authProvider).valueOrNull?.tenantScope;
      return ref
          .watch(operationsApiProvider)
          .fetchGstRegister(resource: key.$1, preset: key.$2, page: key.$3);
    });

class GstRegistersScreen extends ConsumerStatefulWidget {
  const GstRegistersScreen({super.key});
  @override
  ConsumerState<GstRegistersScreen> createState() => _GstRegistersScreenState();
}

class _GstRegistersScreenState extends ConsumerState<GstRegistersScreen> {
  String _resource = 'sales-register';
  String _preset = 'today';
  int _page = 1;
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(gstRegisterProvider((_resource, _preset, _page)));
    return Scaffold(
      appBar: AppBar(
        title: const Text('GST registers', style: OmluTypography.h2),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(
              gstRegisterProvider((_resource, _preset, _page)),
            ),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(OmluSpacing.md),
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _resource,
                  decoration: const InputDecoration(labelText: 'Register'),
                  items: [
                    for (final entry in _gstResources.entries)
                      DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                  ],
                  onChanged: (v) => setState(() {
                    _resource = v!;
                    _page = 1;
                  }),
                ),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'today', label: Text('Today')),
                    ButtonSegment(value: 'last_7_days', label: Text('7 days')),
                    ButtonSegment(value: 'this_month', label: Text('Month')),
                  ],
                  selected: {_preset},
                  onSelectionChanged: (v) => setState(() {
                    _preset = v.first;
                    _page = 1;
                  }),
                ),
              ],
            ),
          ),
          Expanded(
            child: state.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text(userFacingError(e))),
              data: (data) {
                final raw = data['items'] ?? data['rows'] ?? data['data'];
                final items = raw is List
                    ? [
                        for (final value in raw)
                          if (value is Map) Map<String, Object?>.from(value),
                      ]
                    : <Map<String, Object?>>[];
                final summary = data.entries
                    .where(
                      (e) =>
                          !{'items', 'rows', 'data'}.contains(e.key) &&
                          (e.value is num || e.value is String),
                    )
                    .toList();
                return ListView(
                  padding: const EdgeInsets.all(OmluSpacing.md),
                  children: [
                    if (summary.isNotEmpty)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Wrap(
                            spacing: 24,
                            runSpacing: 12,
                            children: [
                              for (final entry in summary.take(12))
                                SizedBox(
                                  width: 150,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        entry.key.replaceAll('_', ' '),
                                        style: OmluTypography.bodySmall,
                                      ),
                                      Text(
                                        '${entry.value}',
                                        style: OmluTypography.h3,
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    if (items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Center(
                          child: Text('No register rows for this period.'),
                        ),
                      ),
                    for (final item in items)
                      Card(
                        child: ExpansionTile(
                          title: Text(
                            '${item['invoice_number'] ?? item['bill_number'] ?? item['hsn_sac_code'] ?? item['gst_rate'] ?? 'Register row'}',
                          ),
                          subtitle: Text(
                            '${item['invoice_date'] ?? item['date'] ?? ''}',
                          ),
                          children: [
                            for (final entry in item.entries)
                              if (entry.value != null)
                                ListTile(
                                  dense: true,
                                  title: Text(entry.key.replaceAll('_', ' ')),
                                  trailing: SizedBox(
                                    width: 170,
                                    child: Text(
                                      '${entry.value}',
                                      textAlign: TextAlign.end,
                                    ),
                                  ),
                                ),
                          ],
                        ),
                      ),
                    if (_resource == 'sales-register')
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            onPressed: _page > 1
                                ? () => setState(() => _page--)
                                : null,
                            icon: const Icon(Icons.chevron_left),
                          ),
                          Text('Page $_page'),
                          IconButton(
                            onPressed: items.length == 25
                                ? () => setState(() => _page++)
                                : null,
                            icon: const Icon(Icons.chevron_right),
                          ),
                        ],
                      ),
                    const Card(
                      child: ListTile(
                        leading: Icon(Icons.download_outlined),
                        title: Text('Authoritative exports'),
                        subtitle: Text(
                          'PDF, XLSX, CSV and CA-package exports remain available in the web admin until native authenticated file handoff is added. No GST values are recalculated on device.',
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
