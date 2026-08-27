import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../core/models/role_session.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';
import '../printing/printer_settings_screen.dart';

final restaurantSettingsProvider = FutureProvider<Map<String, Object?>>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchRestaurantSettings();
});

enum _SettingsSection { operations, tax, review, printers }

class SettingsManagementScreen extends ConsumerStatefulWidget {
  const SettingsManagementScreen({super.key});
  @override
  ConsumerState<SettingsManagementScreen> createState() =>
      _SettingsManagementScreenState();
}

class _SettingsManagementScreenState
    extends ConsumerState<SettingsManagementScreen> {
  _SettingsSection _section = _SettingsSection.operations;
  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(restaurantSettingsProvider);
    final wide = useSplitView(MediaQuery.sizeOf(context).width);
    final nav = NavigationDrawer(
      selectedIndex: _section.index,
      onDestinationSelected: (i) {
        setState(() => _section = _SettingsSection.values[i]);
        if (!wide) Navigator.pop(context);
      },
      children: const [
        Padding(
          padding: EdgeInsets.all(20),
          child: Text('Settings', style: OmluTypography.h2),
        ),
        NavigationDrawerDestination(
          icon: Icon(Icons.restaurant),
          label: Text('Operations'),
        ),
        NavigationDrawerDestination(
          icon: Icon(Icons.receipt_long),
          label: Text('GST & tax'),
        ),
        NavigationDrawerDestination(
          icon: Icon(Icons.star_outline),
          label: Text('Google Reviews'),
        ),
        NavigationDrawerDestination(
          icon: Icon(Icons.print_outlined),
          label: Text('Printers'),
        ),
      ],
    );
    final panel = settings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(userFacingError(e)),
            FilledButton(
              onPressed: () => ref.invalidate(restaurantSettingsProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (data) => switch (_section) {
        _SettingsSection.operations => _OperationsSettings(
          values: data,
          owner: ref.read(authProvider).valueOrNull?.role == StaffRole.owner,
        ),
        _SettingsSection.tax => _TaxSettings(values: data),
        _SettingsSection.review => _ReviewSettings(values: data),
        _SettingsSection.printers => const _PrinterDestinations(),
      },
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Restaurant settings', style: OmluTypography.h2),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(restaurantSettingsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      drawer: wide ? null : Drawer(child: nav),
      body: wide
          ? Row(
              children: [
                SizedBox(width: 280, child: nav),
                const VerticalDivider(width: 1),
                Expanded(child: panel),
              ],
            )
          : panel,
    );
  }
}

class _SavePanel extends ConsumerStatefulWidget {
  const _SavePanel({
    required this.values,
    required this.children,
    required this.payload,
    required this.title,
    this.ownerOnly = true,
  });
  final Map<String, Object?> values;
  final List<Widget> children;
  final Map<String, Object?> Function() payload;
  final String title;
  final bool ownerOnly;
  @override
  ConsumerState<_SavePanel> createState() => _SavePanelState();
}

class _SavePanelState extends ConsumerState<_SavePanel> {
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  Future<void> _save() async {
    if (_busy || !(_formKey.currentState?.validate() ?? true)) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .updateRestaurantSettings(widget.payload());
      ref.invalidate(restaurantSettingsProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Settings saved.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final owner = ref.watch(authProvider).valueOrNull?.role == StaffRole.owner;
    final editable = !widget.ownerOnly || owner;
    return ListView(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      children: [
        Text(widget.title, style: OmluTypography.h1),
        if (!editable)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Material(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(8),
              child: const ListTile(
                leading: Icon(Icons.lock_outline),
                title: Text('Owner permission required'),
                subtitle: Text(
                  'Administrators can view these settings, but only the restaurant owner can change them.',
                ),
              ),
            ),
          ),
        AbsorbPointer(
          absorbing: !editable || _busy,
          child: Form(
            key: _formKey,
            child: Column(children: widget.children),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: editable && !_busy ? _save : null,
          icon: _busy
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save),
          label: Text(_busy ? 'Saving…' : 'Save changes'),
        ),
      ],
    );
  }
}

class _OperationsSettings extends StatefulWidget {
  const _OperationsSettings({required this.values, required this.owner});
  final Map<String, Object?> values;
  final bool owner;
  @override
  State<_OperationsSettings> createState() => _OperationsSettingsState();
}

class _OperationsSettingsState extends State<_OperationsSettings> {
  late String kitchen = '${widget.values['kitchen_mode'] ?? 'kds'}';
  late bool requests = widget.values['service_requests_enabled'] != false;
  late final timezone = TextEditingController(
    text: '${widget.values['timezone'] ?? 'Asia/Kolkata'}',
  );
  late final orderPrefix = TextEditingController(
    text: '${widget.values['order_prefix'] ?? 'OM'}',
  );
  @override
  Widget build(BuildContext context) => _SavePanel(
    values: widget.values,
    title: 'Operations',
    ownerOnly: false,
    payload: () => {
      'kitchen_mode': kitchen,
      if (widget.owner) 'service_requests_enabled': requests,
      if (widget.owner) 'timezone': timezone.text.trim(),
      if (widget.owner) 'order_prefix': orderPrefix.text.trim().toUpperCase(),
    },
    children: [
      DropdownButtonFormField<String>(
        initialValue: kitchen,
        decoration: const InputDecoration(labelText: 'Kitchen mode'),
        items: const [
          DropdownMenuItem(value: 'kds', child: Text('Kitchen Display System')),
          DropdownMenuItem(
            value: 'direct_print',
            child: Text('Direct kitchen printing'),
          ),
        ],
        onChanged: (v) => setState(() => kitchen = v!),
      ),
      if (widget.owner)
        Column(
          children: [
            TextField(
              controller: timezone,
              decoration: const InputDecoration(
                labelText: 'Timezone (IANA name)',
              ),
            ),
            TextField(
              controller: orderPrefix,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Order prefix'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Customer service requests'),
              value: requests,
              onChanged: (v) => setState(() => requests = v),
            ),
          ],
        ),
    ],
  );
}

class _TaxSettings extends StatefulWidget {
  const _TaxSettings({required this.values});
  final Map<String, Object?> values;
  @override
  State<_TaxSettings> createState() => _TaxSettingsState();
}

class _TaxSettingsState extends State<_TaxSettings> {
  late bool enabled = widget.values['gst_enabled'] == true;
  late String mode = '${widget.values['tax_mode'] ?? 'inclusive'}';
  late final gstin = TextEditingController(
    text: '${widget.values['gstin'] ?? ''}',
  );
  late final legal = TextEditingController(
    text: '${widget.values['legal_business_name'] ?? ''}',
  );
  late final address = TextEditingController(
    text: '${widget.values['registered_billing_address'] ?? ''}',
  );
  late final stateName = TextEditingController(
    text: '${widget.values['gst_state_name'] ?? ''}',
  );
  late final stateCode = TextEditingController(
    text: '${widget.values['gst_state_code'] ?? ''}',
  );
  late final rate = TextEditingController(
    text: '${widget.values['default_gst_rate'] ?? '0'}',
  );
  late final invoice = TextEditingController(
    text: '${widget.values['invoice_prefix'] ?? 'INV'}',
  );
  @override
  Widget build(BuildContext context) => _SavePanel(
    values: widget.values,
    title: 'GST & tax',
    payload: () => {
      'gst_enabled': enabled,
      'gstin': gstin.text.trim(),
      'legal_business_name': legal.text.trim(),
      'registered_billing_address': address.text.trim(),
      'gst_state_name': stateName.text.trim(),
      'gst_state_code': stateCode.text.trim(),
      'default_gst_rate': double.tryParse(rate.text),
      'tax_mode': mode,
      'invoice_prefix': invoice.text.trim().toUpperCase(),
    },
    children: [
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('GST enabled'),
        subtitle: const Text(
          'The server requires complete registration details before enabling GST.',
        ),
        value: enabled,
        onChanged: (v) => setState(() => enabled = v),
      ),
      TextFormField(
        controller: gstin,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(labelText: 'GSTIN'),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: (v) =>
            v != null &&
                v.isNotEmpty &&
                !RegExp(
                  r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
                ).hasMatch(v.toUpperCase())
            ? 'Enter a valid 15-character GSTIN.'
            : null,
      ),
      TextField(
        controller: legal,
        decoration: const InputDecoration(labelText: 'Legal business name'),
      ),
      TextField(
        controller: address,
        maxLines: 2,
        decoration: const InputDecoration(
          labelText: 'Registered billing address',
        ),
      ),
      TextField(
        controller: stateName,
        decoration: const InputDecoration(labelText: 'GST state name'),
      ),
      TextFormField(
        controller: stateCode,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'State code'),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: (v) {
          final n = int.tryParse(v ?? '');
          return v != null && v.isNotEmpty && (n == null || n < 1 || n > 38)
              ? 'Use an Indian GST state code from 01 to 38.'
              : null;
        },
      ),
      TextFormField(
        controller: rate,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(labelText: 'Default GST rate (%)'),
      ),
      DropdownButtonFormField<String>(
        initialValue: mode,
        decoration: const InputDecoration(labelText: 'Tax mode'),
        items: const [
          DropdownMenuItem(value: 'inclusive', child: Text('Tax inclusive')),
          DropdownMenuItem(value: 'exclusive', child: Text('Tax exclusive')),
        ],
        onChanged: (v) => setState(() => mode = v!),
      ),
      TextField(
        controller: invoice,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(labelText: 'Invoice prefix'),
      ),
    ],
  );
}

class _ReviewSettings extends StatefulWidget {
  const _ReviewSettings({required this.values});
  final Map<String, Object?> values;
  @override
  State<_ReviewSettings> createState() => _ReviewSettingsState();
}

class _ReviewSettingsState extends State<_ReviewSettings> {
  late final url = TextEditingController(
    text: '${widget.values['google_review_url'] ?? ''}',
  );
  String? _validate(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final uri = Uri.tryParse(value.trim());
    const hosts = {
      'g.page',
      'google.com',
      'www.google.com',
      'maps.google.com',
      'maps.app.goo.gl',
    };
    return uri != null &&
            uri.scheme == 'https' &&
            hosts.contains(uri.host.toLowerCase()) &&
            uri.userInfo.isEmpty
        ? null
        : 'Use an HTTPS Google Review or Google Maps URL.';
  }

  @override
  Widget build(BuildContext context) => _SavePanel(
    values: widget.values,
    title: 'Google Reviews',
    payload: () => {'google_review_url': url.text.trim()},
    children: [
      TextFormField(
        controller: url,
        keyboardType: TextInputType.url,
        decoration: const InputDecoration(
          labelText: 'Google Review URL',
          helperText: 'Accepted: g.page, google.com and maps.app.goo.gl',
        ),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: _validate,
      ),
    ],
  );
}

final printInstallationsProvider = FutureProvider<List<Map<String, Object?>>>((
  ref,
) async {
  final values = await ref
      .watch(operationsApiProvider)
      .fetchPrintBridgeInstallations();
  return [for (final value in values) Map<String, Object?>.from(value as Map)];
});

class _PrinterDestinations extends ConsumerWidget {
  const _PrinterDestinations();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bridges = ref.watch(printInstallationsProvider);
    return ListView(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      children: [
        Text('Printer configuration', style: OmluTypography.h1),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.receipt_long),
            title: const Text('Billing printer'),
            subtitle: const Text(
              'Configure the on-device receipt printer and test printing',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const PrinterSettingsScreen(),
              ),
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.soup_kitchen),
            title: const Text('Kitchen printer'),
            subtitle: const Text(
              'Status is reported by the authorized OMLU Print Bridge',
            ),
          ),
        ),
        bridges.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text(userFacingError(e)),
          data: (items) => Column(
            children: [
              for (final bridge in items)
                Card(
                  child: ListTile(
                    leading: Icon(
                      bridge['status'] == 'active'
                          ? Icons.check_circle
                          : Icons.error_outline,
                      color: bridge['status'] == 'active'
                          ? OmluColors.statusAvailable
                          : Colors.orange,
                    ),
                    title: Text(
                      '${bridge['device_name'] ?? bridge['installation_name'] ?? 'Print Bridge'}',
                    ),
                    subtitle: Text(
                      'Billing: ${bridge['billing_printer_configured'] == true ? bridge['billing_printer_label'] ?? 'Configured' : 'Not configured'}\nKitchen: ${bridge['kitchen_printer_configured'] == true ? bridge['kitchen_printer_label'] ?? 'Configured' : 'Not configured'}',
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
