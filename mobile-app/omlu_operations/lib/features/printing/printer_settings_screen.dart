import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/role_session.dart';
import '../../core/printing/esc_pos_encoder.dart';
import '../../core/printing/printer_adapter.dart';
import '../../core/printing/printer_service.dart';
import '../../core/storage/key_value_storage.dart';
import '../../design_system/spacing.dart';
import '../auth_provider.dart';

final printerServiceProvider = Provider<PrinterService>((ref) {
  return PrinterService(storage: SecureKeyValueStorage());
});

final printerConfigProvider = FutureProvider<PrinterConfig>((ref) {
  return ref.watch(printerServiceProvider).loadConfig();
});

class PrinterSettingsScreen extends ConsumerStatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  ConsumerState<PrinterSettingsScreen> createState() =>
      _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends ConsumerState<PrinterSettingsScreen> {
  final _ipController = TextEditingController();
  final _portController = TextEditingController(text: '9100');
  PaperWidth _paperWidth = PaperWidth.mm58;
  bool _enabled = false;
  int _copies = 1;
  bool _autoCut = true;
  bool _initialized = false;
  bool _busy = false;

  @override
  void dispose() {
    _ipController.dispose();
    _portController.dispose();
    super.dispose();
  }

  PrinterConfig _currentConfig() => PrinterConfig(
    enabled: _enabled,
    tcpIpAddress: _ipController.text.trim(),
    tcpPort: int.tryParse(_portController.text) ?? 9100,
    paperWidth: _paperWidth,
    copies: _copies,
    autoCut: _autoCut,
  );

  Future<void> _save({bool test = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final service = ref.read(printerServiceProvider);
      await service.saveConfig(_currentConfig());
      if (test) await service.printTestPage();
      ref.invalidate(printerConfigProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            test
                ? 'Receipt printed successfully.'
                : 'TCP printer settings saved.',
          ),
        ),
      );
    } on PrinterException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionRole = ref.watch(authProvider).valueOrNull?.role;
    if (sessionRole == StaffRole.staff || sessionRole == StaffRole.kitchen) {
      return Scaffold(
        appBar: AppBar(title: const Text('Access Denied')),
        body: const Center(
          child: Text(
            'Printer setup is reserved for owners and administrators.',
          ),
        ),
      );
    }

    final config = ref.watch(printerConfigProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('TCP/LAN printer')),
      body: config.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (value) {
          if (!_initialized) {
            _initialized = true;
            _ipController.text = value.tcpIpAddress;
            _portController.text = value.tcpPort.toString();
            _paperWidth = value.paperWidth;
            _enabled = value.enabled;
            _copies = value.copies;
            _autoCut = value.autoCut;
          }
          return ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: [
              const Text(
                'This release supports TCP/LAN ESC/POS printers only. Bluetooth, USB and Android system printing are not supported yet.',
              ),
              const SizedBox(height: OmluSpacing.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Enable TCP printing'),
                subtitle: const Text(
                  'Print from this device to the configured LAN printer.',
                ),
                value: _enabled,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _enabled = value),
              ),
              const SizedBox(height: OmluSpacing.sm),
              TextField(
                controller: _ipController,
                decoration: const InputDecoration(
                  labelText: 'Printer IP address / Hostname',
                  hintText: '192.168.1.100',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: OmluSpacing.md),
              TextField(
                controller: _portController,
                decoration: const InputDecoration(
                  labelText: 'Port (default 9100)',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: OmluSpacing.md),
              DropdownButtonFormField<int>(
                initialValue: _copies,
                decoration: const InputDecoration(
                  labelText: 'Number of copies',
                  border: OutlineInputBorder(),
                ),
                items: [1, 2, 3, 4, 5]
                    .map(
                      (count) =>
                          DropdownMenuItem(value: count, child: Text('$count')),
                    )
                    .toList(),
                onChanged: (value) => setState(() {
                  if (value != null) _copies = value;
                }),
              ),
              const SizedBox(height: OmluSpacing.md),
              DropdownButtonFormField<PaperWidth>(
                initialValue: _paperWidth,
                decoration: const InputDecoration(
                  labelText: 'Paper width',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: PaperWidth.mm58,
                    child: Text('58 mm'),
                  ),
                  DropdownMenuItem(
                    value: PaperWidth.mm80,
                    child: Text('80 mm'),
                  ),
                ],
                onChanged: (value) => setState(() {
                  if (value != null) _paperWidth = value;
                }),
              ),
              const SizedBox(height: OmluSpacing.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Auto-cut paper'),
                subtitle: const Text(
                  'Send cut command after printing receipt.',
                ),
                value: _autoCut,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _autoCut = value),
              ),
              const SizedBox(height: OmluSpacing.lg),
              FilledButton(
                onPressed: _busy ? null : () => _save(),
                child: const Text('Save settings'),
              ),
              const SizedBox(height: OmluSpacing.sm),
              OutlinedButton(
                onPressed: _busy ? null : () => _save(test: true),
                child: const Text('Test print'),
              ),
            ],
          );
        },
      ),
    );
  }
}
