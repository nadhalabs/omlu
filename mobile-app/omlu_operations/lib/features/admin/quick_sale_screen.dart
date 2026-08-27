import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/spacing.dart';
import '../auth_provider.dart';
import '../printing/printer_settings_screen.dart';
import '../staff/menu_provider.dart';

class QuickSaleScreen extends ConsumerStatefulWidget {
  const QuickSaleScreen({super.key});

  @override
  ConsumerState<QuickSaleScreen> createState() => _QuickSaleScreenState();
}

class _Line {
  _Line(this.item, this.selections);
  final MenuItem item;
  final List<Map<String, Object?>> selections;
  int quantity = 1;
}

class _QuickSaleScreenState extends ConsumerState<QuickSaleScreen> {
  List<MenuItem> _menu = const [];
  List<Map<String, Object?>> _active = const [];
  final List<_Line> _cart = [];
  Map<String, Object?>? _preview;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String _saleType = 'late_entry';
  String _payment = 'cash';
  String? _idempotencyKey;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref.read(operationsApiProvider).fetchQuickSales();
      if (!mounted) {
        return;
      }
      setState(() {
        _menu = parseMenuItems(data['menu_items'] as List? ?? const []);
        _active = [
          for (final v in data['active_takeaways'] as List? ?? const [])
            Map<String, Object?>.from(v as Map),
        ];
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = userFacingError(e);
          _loading = false;
        });
      }
    }
  }

  Map<String, Object?> _payload() => {
    'sale_type': _saleType,
    'items': [
      for (final line in _cart)
        {
          'menu_item_id': line.item.id,
          'quantity': line.quantity,
          'selected_options': line.selections,
        },
    ],
    if (_saleType == 'late_entry') 'payment_method': _payment,
  };

  Future<void> _refreshPreview() async {
    if (_cart.isEmpty) {
      if (mounted) setState(() => _preview = null);
      return;
    }
    try {
      final value = await ref
          .read(operationsApiProvider)
          .previewQuickSale(_payload());
      if (mounted) {
        setState(() {
          _preview = value;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = userFacingError(e));
    }
  }

  Future<void> _chooseItem(MenuItem item) async {
    final selections = <Map<String, Object?>>[];
    for (final group in item.optionGroups) {
      final available = group.options.where((o) => o.available).toList();
      if (available.isEmpty && group.effectiveMinimum > 0) {
        setState(() => _error = '${group.name} has no available choice.');
        return;
      }
      if (group.isSingleSelect) {
        final selected = await showModalBottomSheet<MenuOptionValue>(
          context: context,
          isScrollControlled: true,
          builder: (context) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  title: Text(
                    group.name,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                for (final option in available)
                  ListTile(
                    title: Text(option.name),
                    subtitle: Text(
                      option.priceEffect == 0
                          ? 'No extra charge'
                          : 'Price ${option.priceEffect.toStringAsFixed(2)}',
                    ),
                    onTap: () => Navigator.pop(context, option),
                  ),
                if (group.effectiveMinimum == 0)
                  ListTile(
                    title: const Text('No selection'),
                    onTap: () => Navigator.pop(context),
                  ),
              ],
            ),
          ),
        );
        if (selected == null && group.effectiveMinimum > 0) return;
        if (selected != null) {
          selections.add({
            'group_id': group.id,
            'option_id': selected.id,
            'quantity': 1,
          });
        }
      } else {
        final chosen = <int>{};
        final result = await showModalBottomSheet<Set<int>>(
          context: context,
          isScrollControlled: true,
          builder: (context) => StatefulBuilder(
            builder: (context, update) => SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ListTile(
                    title: Text(
                      group.name,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  for (final option in available)
                    CheckboxListTile(
                      value: chosen.contains(option.id),
                      title: Text(option.name),
                      onChanged: (v) => update(() {
                        if (v == true &&
                            chosen.length < group.maximumSelections) {
                          chosen.add(option.id);
                        } else if (v != true) {
                          chosen.remove(option.id);
                        }
                      }),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: FilledButton(
                      onPressed: chosen.length >= group.effectiveMinimum
                          ? () => Navigator.pop(context, chosen)
                          : null,
                      child: const Text('Add choices'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        if (result == null && group.effectiveMinimum > 0) return;
        for (final id in result ?? const <int>{}) {
          selections.add({
            'group_id': group.id,
            'option_id': id,
            'quantity': 1,
          });
        }
      }
    }
    setState(() => _cart.add(_Line(item, selections)));
    await _refreshPreview();
  }

  Future<void> _submit() async {
    if (_submitting || _cart.isEmpty || _preview == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    _idempotencyKey ??= 'mobile-quick-${DateTime.now().microsecondsSinceEpoch}';
    try {
      final sale = await ref
          .read(operationsApiProvider)
          .createQuickSale(body: _payload(), idempotencyKey: _idempotencyKey!);
      if (!mounted) return;
      final completed = sale['status'] == 'completed';
      if (completed) {
        try {
          final receipt = await ref
              .read(operationsApiProvider)
              .fetchQuickSaleReceipt(sale['public_token'].toString());
          final printer = ref.read(printerServiceProvider);
          await printer.loadConfig();
          await printer.printReceipt(receipt);
        } catch (_) {}
      }
      if (!mounted) {
        return;
      }
      setState(() {
        _cart.clear();
        _preview = null;
        _idempotencyKey = null;
        _submitting = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            completed
                ? 'Sale completed and bill issued.'
                : 'Takeaway sent to kitchen.',
          ),
        ),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = userFacingError(e);
          _submitting = false;
        });
      }
    }
  }

  Future<void> _payTakeaway(Map<String, Object?> sale) async {
    if (_submitting) return;
    final method = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(title: Text('Record takeaway payment')),
            ListTile(
              leading: const Icon(Icons.payments),
              title: const Text('Cash'),
              onTap: () => Navigator.pop(context, 'cash'),
            ),
            ListTile(
              leading: const Icon(Icons.qr_code),
              title: const Text('UPI'),
              onTap: () => Navigator.pop(context, 'upi'),
            ),
          ],
        ),
      ),
    );
    if (method == null || !mounted) return;
    setState(() => _submitting = true);
    try {
      final token = sale['public_token'].toString();
      await ref
          .read(operationsApiProvider)
          .payQuickSale(
            publicToken: token,
            method: method,
            idempotencyKey: 'mobile-quick-payment-$token-$method',
          );
      final receipt = await ref
          .read(operationsApiProvider)
          .fetchQuickSaleReceipt(token);
      try {
        final printer = ref.read(printerServiceProvider);
        await printer.loadConfig();
        await printer.printReceipt(receipt);
      } catch (_) {}
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment recorded and bill issued.')),
      );
      setState(() => _submitting = false);
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = userFacingError(e);
        });
      }
    }
  }

  void _showActiveTakeaways() => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .65,
        builder: (context, controller) => ListView(
          controller: controller,
          children: [
            const ListTile(title: Text('Active takeaways')),
            for (final sale in _active)
              ListTile(
                title: Text(sale['order_number']?.toString() ?? 'Takeaway'),
                subtitle: Text(
                  '${sale['status']} • ₹${sale['grand_total'] ?? sale['total']}',
                ),
                trailing: sale['status'] == 'served'
                    ? FilledButton(
                        onPressed: _submitting
                            ? null
                            : () => _payTakeaway(sale),
                        child: const Text('Pay'),
                      )
                    : null,
              ),
          ],
        ),
      ),
    ),
  );

  Widget _catalog() => ListView.builder(
    padding: const EdgeInsets.all(OmluSpacing.md),
    itemCount: _menu.length,
    itemBuilder: (context, i) {
      final item = _menu[i];
      return Card(
        child: ListTile(
          minVerticalPadding: 14,
          title: Text(item.name),
          subtitle: Text(
            '₹${item.price.toStringAsFixed(2)}${item.optionGroups.isNotEmpty ? ' • choices' : ''}',
          ),
          trailing: const Icon(Icons.add_circle_outline),
          onTap: () => _chooseItem(item),
        ),
      );
    },
  );

  Widget _cartPanel() => Column(
    children: [
      if (_active.isNotEmpty)
        MaterialBanner(
          content: Text('${_active.length} takeaway order(s) active in KDS'),
          actions: [
            TextButton(
              onPressed: _showActiveTakeaways,
              child: const Text('View'),
            ),
          ],
        ),
      Padding(
        padding: const EdgeInsets.all(12),
        child: SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'late_entry', label: Text('Counter sale')),
            ButtonSegment(value: 'takeaway', label: Text('Takeaway')),
          ],
          selected: {_saleType},
          onSelectionChanged: _submitting
              ? null
              : (v) {
                  setState(() => _saleType = v.first);
                  _refreshPreview();
                },
        ),
      ),
      Expanded(
        child: _cart.isEmpty
            ? const Center(child: Text('Add items to start a sale.'))
            : ListView.builder(
                itemCount: _cart.length,
                itemBuilder: (context, i) {
                  final line = _cart[i];
                  return ListTile(
                    title: Text(line.item.name),
                    subtitle: Text('${line.selections.length} choice(s)'),
                    leading: IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: () {
                        setState(() {
                          if (line.quantity > 1) {
                            line.quantity--;
                          } else {
                            _cart.removeAt(i);
                          }
                        });
                        _refreshPreview();
                      },
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${line.quantity}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: line.quantity >= 50
                              ? null
                              : () {
                                  setState(() => line.quantity++);
                                  _refreshPreview();
                                },
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.all(8),
          child: Text(_error!, style: const TextStyle(color: Colors.red)),
        ),
      if (_preview != null)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              _total('Subtotal', _preview!['subtotal']),
              _total('Tax', _preview!['tax_amount']),
              _total('Total', _preview!['grand_total'], strong: true),
              if (_saleType == 'late_entry')
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'cash', label: Text('Cash')),
                    ButtonSegment(value: 'upi', label: Text('UPI')),
                  ],
                  selected: {_payment},
                  onSelectionChanged: (v) {
                    setState(() => _payment = v.first);
                    _refreshPreview();
                  },
                ),
            ],
          ),
        ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const CircularProgressIndicator()
                : Text(
                    _saleType == 'late_entry'
                        ? 'Pay & issue bill'
                        : 'Send to kitchen',
                  ),
          ),
        ),
      ),
    ],
  );

  Widget _total(String label, Object? value, {bool strong = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label),
        Text(
          '₹${value ?? '0.00'}',
          style: strong ? Theme.of(context).textTheme.titleLarge : null,
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Quick sale'),
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null && _menu.isEmpty
        ? Center(
            child: FilledButton(onPressed: _load, child: const Text('Retry')),
          )
        : LayoutBuilder(
            builder: (context, c) {
              if (useSplitView(c.maxWidth)) {
                return Row(
                  children: [
                    Expanded(flex: 3, child: _catalog()),
                    const VerticalDivider(width: 1),
                    Expanded(flex: 2, child: _cartPanel()),
                  ],
                );
              }
              return _cartPanel();
            },
          ),
    floatingActionButton:
        _loading || useSplitView(MediaQuery.sizeOf(context).width)
        ? null
        : FloatingActionButton.extended(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => Scaffold(
                  appBar: AppBar(title: const Text('Add items')),
                  body: _catalog(),
                ),
              ),
            ),
            icon: const Icon(Icons.add),
            label: const Text('Add items'),
          ),
  );
}
