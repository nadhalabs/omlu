import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';
import '../payments/pending_bill_review_screen.dart';

enum HistoryResource { orders, bills, sessions }

class HistoryFilter {
  const HistoryFilter({
    this.preset = 'today',
    this.start,
    this.end,
    this.status,
    this.paymentMethod,
    this.search = '',
  });
  final String preset;
  final DateTime? start;
  final DateTime? end;
  final String? status;
  final String? paymentMethod;
  final String search;
}

class HistoryExplorerScreen extends ConsumerStatefulWidget {
  const HistoryExplorerScreen({super.key});
  @override
  ConsumerState<HistoryExplorerScreen> createState() =>
      _HistoryExplorerScreenState();
}

class _HistoryExplorerScreenState extends ConsumerState<HistoryExplorerScreen> {
  HistoryResource _resource = HistoryResource.orders;
  HistoryFilter _filter = const HistoryFilter();
  final List<Map<String, Object?>> _items = [];
  Map<String, Object?>? _selected;
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  Future<void> _load({required bool reset}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _page = 1;
        _items.clear();
        _selected = null;
      }
    });
    try {
      final data = await ref
          .read(operationsApiProvider)
          .fetchHistory(
            resource: _resource.name,
            preset: _filter.preset,
            startDate: _filter.start,
            endDate: _filter.end,
            status: _filter.status,
            search: _filter.search,
            paymentMethod: _filter.paymentMethod,
            page: _page,
          );
      final values = data['items'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        _items.addAll([
          for (final value in values) Map<String, Object?>.from(value as Map),
        ]);
        _total = int.tryParse('${data['total']}') ?? _items.length;
        if (_items.isNotEmpty &&
            useSplitView(MediaQuery.sizeOf(context).width)) {
          _selected ??= _items.first;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _filters() async {
    final result = await showModalBottomSheet<HistoryFilter>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _HistoryFilterSheet(resource: _resource, initial: _filter),
    );
    if (result != null) {
      _filter = result;
      await _load(reset: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = useSplitView(MediaQuery.sizeOf(context).width);
    final list = Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(OmluSpacing.md),
          child: Row(
            children: [
              Expanded(
                child: SegmentedButton<HistoryResource>(
                  segments: const [
                    ButtonSegment(
                      value: HistoryResource.orders,
                      icon: Icon(Icons.receipt_long),
                      label: Text('Orders'),
                    ),
                    ButtonSegment(
                      value: HistoryResource.bills,
                      icon: Icon(Icons.payments),
                      label: Text('Bills'),
                    ),
                    ButtonSegment(
                      value: HistoryResource.sessions,
                      icon: Icon(Icons.table_restaurant),
                      label: Text('Sessions'),
                    ),
                  ],
                  selected: {_resource},
                  showSelectedIcon: false,
                  onSelectionChanged: (values) {
                    setState(() => _resource = values.first);
                    _load(reset: true);
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Filters',
                onPressed: _filters,
                icon: const Icon(Icons.filter_list),
              ),
            ],
          ),
        ),
        if (_filter.preset != 'today' ||
            _filter.status != null ||
            _filter.paymentMethod != null ||
            _filter.search.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: OmluSpacing.md),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Chip(
                label: Text(
                  _filter.start == null
                      ? _filter.preset.replaceAll('_', ' ')
                      : '${_date(_filter.start)} – ${_date(_filter.end)} · ${_filter.status ?? 'all'}',
                ),
              ),
            ),
          ),
        if (_loading && _items.isEmpty)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else if (_error != null && _items.isEmpty)
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(userFacingError(_error!)),
                  FilledButton(
                    onPressed: () => _load(reset: true),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          )
        else if (_items.isEmpty)
          const Expanded(
            child: Center(
              child: Text('No historical records match these filters.'),
            ),
          )
        else
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _load(reset: true),
              child: ListView.separated(
                itemCount: _items.length + (_items.length < _total ? 1 : 0),
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, index) {
                  if (index == _items.length) {
                    return Padding(
                      padding: const EdgeInsets.all(20),
                      child: FilledButton.tonal(
                        onPressed: _loading
                            ? null
                            : () {
                                _page++;
                                _load(reset: false);
                              },
                        child: Text(
                          _loading
                              ? 'Loading…'
                              : 'Load more (${_items.length} of $_total)',
                        ),
                      ),
                    );
                  }
                  final item = _items[index];
                  return _HistoryTile(
                    resource: _resource,
                    item: item,
                    selected: _selected == item,
                    onTap: () {
                      if (wide) {
                        setState(() => _selected = item);
                      } else {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                _HistoryDetail(resource: _resource, item: item),
                          ),
                        );
                      }
                    },
                  );
                },
              ),
            ),
          ),
      ],
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Historical operations', style: OmluTypography.h2),
        actions: [
          IconButton(
            tooltip: 'Refresh history',
            onPressed: () => _load(reset: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: wide
          ? Row(
              children: [
                Expanded(flex: 3, child: list),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 2,
                  child: _selected == null
                      ? const Center(child: Text('Select a record.'))
                      : _HistoryDetail(
                          resource: _resource,
                          item: _selected!,
                          embedded: true,
                        ),
                ),
              ],
            )
          : list,
    );
  }
}

String _date(DateTime? value) => value == null
    ? '—'
    : '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({
    required this.resource,
    required this.item,
    required this.selected,
    required this.onTap,
  });
  final HistoryResource resource;
  final Map<String, Object?> item;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final title = switch (resource) {
      HistoryResource.orders => item['order_number'],
      HistoryResource.bills => item['bill_number'],
      HistoryResource.sessions => 'Table ${item['table_number'] ?? '—'}',
    };
    final amount =
        item['total'] ?? item['grand_total'] ?? item['final_bill_total'];
    final status = item['status'] ?? item['payment_status'];
    return ListTile(
      selected: selected,
      minVerticalPadding: 12,
      leading: Icon(switch (resource) {
        HistoryResource.orders => Icons.receipt_long,
        HistoryResource.bills => Icons.payments,
        HistoryResource.sessions => Icons.table_restaurant,
      }, color: OmluColors.accent),
      title: Text('$title', style: OmluTypography.h3),
      subtitle: Text(
        '${item['table_number'] == null ? '' : 'Table ${item['table_number']} · '}${status ?? ''}',
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (amount != null) Text('₹$amount', style: OmluTypography.h3),
          const Icon(Icons.chevron_right, size: 18),
        ],
      ),
      onTap: onTap,
    );
  }
}

class _HistoryDetail extends StatelessWidget {
  const _HistoryDetail({
    required this.resource,
    required this.item,
    this.embedded = false,
  });
  final HistoryResource resource;
  final Map<String, Object?> item;
  final bool embedded;
  @override
  Widget build(BuildContext context) {
    final content = ListView(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      children: [
        Text(switch (resource) {
          HistoryResource.orders => '${item['order_number']}',
          HistoryResource.bills => '${item['bill_number']}',
          HistoryResource.sessions => 'Table ${item['table_number']}',
        }, style: OmluTypography.h1),
        const SizedBox(height: 12),
        for (final entry in item.entries.where(
          (entry) => !{'id', 'session_token'}.contains(entry.key),
        ))
          if (entry.value != null &&
              entry.value is! List &&
              entry.value is! Map)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      entry.key.replaceAll('_', ' '),
                      style: OmluTypography.bodySmall,
                    ),
                  ),
                  Expanded(
                    child: Text('${entry.value}', textAlign: TextAlign.end),
                  ),
                ],
              ),
            ),
        if (resource == HistoryResource.bills &&
            '${item['bill_number'] ?? ''}'.isNotEmpty &&
            !'${item['id']}'.startsWith('quick-'))
          FilledButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => PendingBillReviewScreen(
                  billNumber: '${item['bill_number']}',
                ),
              ),
            ),
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open bill and receipt'),
          ),
      ],
    );
    return embedded
        ? content
        : Scaffold(
            appBar: AppBar(title: const Text('History detail')),
            body: content,
          );
  }
}

class _HistoryFilterSheet extends StatefulWidget {
  const _HistoryFilterSheet({required this.resource, required this.initial});
  final HistoryResource resource;
  final HistoryFilter initial;
  @override
  State<_HistoryFilterSheet> createState() => _HistoryFilterSheetState();
}

class _HistoryFilterSheetState extends State<_HistoryFilterSheet> {
  late String _preset = widget.initial.preset;
  late String? _status = widget.initial.status;
  late String? _payment = widget.initial.paymentMethod;
  late DateTime? _start = widget.initial.start;
  late DateTime? _end = widget.initial.end;
  late final _search = TextEditingController(text: widget.initial.search);
  Future<void> _range() async {
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (range != null) {
      setState(() {
        _preset = 'custom';
        _start = range.start;
        _end = range.end;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final statuses = switch (widget.resource) {
      HistoryResource.orders => const ['served', 'rejected', 'cancelled'],
      HistoryResource.bills => const ['paid', 'unpaid', 'cancelled'],
      HistoryResource.sessions => const [
        'closed',
        'cancelled',
        'payment_pending',
      ],
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('Filter history', style: OmluTypography.h2),
          Wrap(
            spacing: 8,
            children: [
              for (final preset in ['today', 'yesterday', 'last_7_days'])
                ChoiceChip(
                  label: Text(preset.replaceAll('_', ' ')),
                  selected: _preset == preset,
                  onSelected: (_) => setState(() {
                    _preset = preset;
                    _start = null;
                    _end = null;
                  }),
                ),
              ActionChip(
                avatar: const Icon(Icons.date_range, size: 18),
                label: Text(
                  _start == null
                      ? 'Custom dates'
                      : '${_date(_start)} – ${_date(_end)}',
                ),
                onPressed: _range,
              ),
            ],
          ),
          if (widget.resource == HistoryResource.orders)
            TextField(
              controller: _search,
              decoration: const InputDecoration(
                labelText: 'Order number search',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          DropdownButtonFormField<String?>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: [
              const DropdownMenuItem(value: null, child: Text('All statuses')),
              for (final status in statuses)
                DropdownMenuItem(
                  value: status,
                  child: Text(status.replaceAll('_', ' ')),
                ),
            ],
            onChanged: (v) => setState(() => _status = v),
          ),
          if (widget.resource == HistoryResource.bills)
            DropdownButtonFormField<String?>(
              initialValue: _payment,
              decoration: const InputDecoration(labelText: 'Payment method'),
              items: const [
                DropdownMenuItem(value: null, child: Text('All methods')),
                DropdownMenuItem(value: 'counter_cash', child: Text('Cash')),
                DropdownMenuItem(value: 'counter_upi', child: Text('UPI')),
                DropdownMenuItem(value: 'online', child: Text('Online')),
              ],
              onChanged: (v) => setState(() => _payment = v),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              HistoryFilter(
                preset: _preset,
                start: _start,
                end: _end,
                status: _status,
                paymentMethod: _payment,
                search: _search.text.trim(),
              ),
            ),
            child: const Text('Apply filters'),
          ),
        ],
      ),
    );
  }
}
