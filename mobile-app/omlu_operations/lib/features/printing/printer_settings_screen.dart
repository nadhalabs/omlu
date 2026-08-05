import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/role_session.dart';
import '../../core/printing/bluetooth_permission_helper.dart';
import '../../core/printing/bluetooth_platform.dart';
import '../../core/printing/esc_pos_encoder.dart';
import '../../core/printing/printer_adapter.dart';
import '../../core/printing/printer_profile.dart';
import '../../core/printing/printer_service.dart';
import '../../core/printing/printer_transport.dart';
import '../../core/storage/key_value_storage.dart';
import '../../design_system/spacing.dart';
import '../auth_provider.dart';

final bluetoothPlatformProvider = Provider<OmluBluetoothPlatform>((ref) {
  return MethodChannelBluetoothPlatform();
});

final printerServiceProvider = Provider<PrinterService>((ref) {
  final platform = ref.watch(bluetoothPlatformProvider);
  return PrinterService(
    storage: SecureKeyValueStorage(),
    bluetoothPlatform: platform,
  );
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
  final _btNameController = TextEditingController();
  final _btAddressController = TextEditingController();
  final _rfcommUuidController = TextEditingController();
  final _bleNameController = TextEditingController();
  final _bleIdController = TextEditingController();
  final _bleServiceUuidController = TextEditingController();
  final _bleCharUuidController = TextEditingController();
  final _chunkSizeController = TextEditingController(text: '128');
  final _delayController = TextEditingController(text: '20');

  PrinterTransportType _transport = PrinterTransportType.bluetoothClassic;
  PrinterProfileType _profile = PrinterProfileType.generic58;
  PaperWidth _paperWidth = PaperWidth.mm58;
  bool _enabled = false;
  int _copies = 1;
  bool _autoCut = true;
  String _bleWriteMode = 'auto';

  bool _initialized = false;
  bool _busy = false;
  bool _isScanning = false;

  final _devices = <DiscoveredPrinterDevice>[];
  StreamSubscription<DiscoveredPrinterDevice>? _scanSubscription;

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _ipController.dispose();
    _portController.dispose();
    _btNameController.dispose();
    _btAddressController.dispose();
    _rfcommUuidController.dispose();
    _bleNameController.dispose();
    _bleIdController.dispose();
    _bleServiceUuidController.dispose();
    _bleCharUuidController.dispose();
    _chunkSizeController.dispose();
    _delayController.dispose();
    super.dispose();
  }

  void _applyProfile(PrinterProfileType profileType) {
    final cfg = PrinterProfileConfig.fromType(profileType);
    setState(() {
      _profile = profileType;
      _paperWidth = cfg.paperWidth;
      _chunkSizeController.text = cfg.chunkSize.toString();
      _delayController.text = cfg.interChunkDelayMs.toString();
      _autoCut = cfg.autoCut;
    });
  }

  PrinterConfig _currentConfig() => PrinterConfig(
    enabled: _enabled,
    transport: _transport,
    profile: _profile,
    paperWidth: _paperWidth,
    copies: _copies,
    autoCut: _autoCut,
    chunkSize: int.tryParse(_chunkSizeController.text) ?? 128,
    interChunkDelayMs: int.tryParse(_delayController.text) ?? 20,
    tcpIpAddress: _ipController.text.trim(),
    tcpPort: int.tryParse(_portController.text) ?? 9100,
    btDeviceName: _btNameController.text.trim(),
    btDeviceAddress: _btAddressController.text.trim(),
    btRfcommUuid: _rfcommUuidController.text.trim().isEmpty
        ? null
        : _rfcommUuidController.text.trim(),
    bleDeviceName: _bleNameController.text.trim(),
    bleDeviceIdentifier: _bleIdController.text.trim(),
    bleServiceUuid: _bleServiceUuidController.text.trim().isEmpty
        ? null
        : _bleServiceUuidController.text.trim(),
    bleWriteCharacteristicUuid: _bleCharUuidController.text.trim().isEmpty
        ? null
        : _bleCharUuidController.text.trim(),
    bleWriteMode: _bleWriteMode,
  );

  Future<void> _startScan() async {
    final sessionRole = ref.read(authProvider).valueOrNull?.role;
    if (sessionRole == StaffRole.staff || sessionRole == StaffRole.kitchen) {
      return;
    }

    final platform = ref.read(bluetoothPlatformProvider);
    final helper = BluetoothPermissionHelper(platform: platform);

    try {
      await helper.ensureScanPermissions();
      setState(() {
        _isScanning = true;
        _devices.clear();
      });

      final paired = await platform.getPairedDevices();
      if (mounted) {
        setState(() {
          _devices.addAll(paired);
        });
      }

      _scanSubscription?.cancel();
      _scanSubscription = platform.startScan().listen(
        (device) {
          if (!mounted) return;
          setState(() {
            if (!_devices.any((d) => d.address == device.address)) {
              _devices.add(device);
            }
          });
        },
        onError: (Object error) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('$error'), backgroundColor: Colors.red),
            );
          }
        },
        onDone: () {
          if (mounted) setState(() => _isScanning = false);
        },
      );
    } on PrinterException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message), backgroundColor: Colors.red),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Bluetooth discovery failed.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isScanning = false);
    }
  }

  void _selectDevice(DiscoveredPrinterDevice device) {
    setState(() {
      if (device.capabilities.contains(BluetoothCapability.ble) &&
          !device.capabilities.contains(BluetoothCapability.classic)) {
        _transport = PrinterTransportType.bluetoothLowEnergy;
        _bleNameController.text = device.name;
        _bleIdController.text = device.address;
      } else {
        _transport = PrinterTransportType.bluetoothClassic;
        _btNameController.text = device.name;
        _btAddressController.text = device.address;
      }
      _enabled = true;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Selected printer ${device.name}')),
    );
  }

  Future<void> _save({bool test = false}) async {
    final sessionRole = ref.read(authProvider).valueOrNull?.role;
    if (sessionRole == StaffRole.staff || sessionRole == StaffRole.kitchen) {
      return;
    }

    if (_busy) return;
    setState(() => _busy = true);
    try {
      final service = ref.read(printerServiceProvider);
      final cfg = _currentConfig();
      await service.saveConfig(cfg);
      if (test) await service.printTestPage();
      ref.invalidate(printerConfigProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            test
                ? 'Receipt printed successfully.'
                : 'Printer settings saved.',
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
      appBar: AppBar(title: const Text('Printer Setup')),
      body: config.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (value) {
          if (!_initialized) {
            _initialized = true;
            _transport = value.transport;
            _profile = value.profile;
            _paperWidth = value.paperWidth;
            _enabled = value.enabled;
            _copies = value.copies;
            _autoCut = value.autoCut;
            _chunkSizeController.text = value.chunkSize.toString();
            _delayController.text = value.interChunkDelayMs.toString();
            _ipController.text = value.tcpIpAddress;
            _portController.text = value.tcpPort.toString();
            _btNameController.text = value.btDeviceName;
            _btAddressController.text = value.btDeviceAddress;
            _rfcommUuidController.text = value.btRfcommUuid ?? '';
            _bleNameController.text = value.bleDeviceName;
            _bleIdController.text = value.bleDeviceIdentifier;
            _bleServiceUuidController.text = value.bleServiceUuid ?? '';
            _bleCharUuidController.text =
                value.bleWriteCharacteristicUuid ?? '';
            _bleWriteMode = value.bleWriteMode;
          }

          return ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: [
              // Top Segmented Connection Choice
              SegmentedButton<PrinterTransportType>(
                segments: const [
                  ButtonSegment(
                    value: PrinterTransportType.bluetoothClassic,
                    label: Text('Bluetooth'),
                    icon: Icon(Icons.bluetooth_rounded),
                  ),
                  ButtonSegment(
                    value: PrinterTransportType.tcpLan,
                    label: Text('Network'),
                    icon: Icon(Icons.lan_rounded),
                  ),
                ],
                selected: {
                  _transport == PrinterTransportType.tcpLan
                      ? PrinterTransportType.tcpLan
                      : PrinterTransportType.bluetoothClassic,
                },
                onSelectionChanged: (val) {
                  setState(() {
                    _transport = val.first;
                  });
                },
              ),
              const SizedBox(height: OmluSpacing.md),

              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Enable printing'),
                subtitle: const Text(
                  'Print receipts automatically upon bill issuance.',
                ),
                value: _enabled,
                onChanged: _busy ? null : (v) => setState(() => _enabled = v),
              ),
              const SizedBox(height: OmluSpacing.sm),

              if (_transport == PrinterTransportType.tcpLan) ...[
                // Network TCP Section
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
              ] else ...[
                // Bluetooth Simple Section
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(OmluSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('Selected Printer', style: Theme.of(context).textTheme.titleMedium),
                            const Spacer(),
                            if (_isScanning)
                              const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            else
                              OutlinedButton.icon(
                                icon: const Icon(Icons.search_rounded),
                                label: const Text('Scan Devices'),
                                onPressed: _startScan,
                              ),
                          ],
                        ),
                        const SizedBox(height: OmluSpacing.sm),
                        Text(
                          _transport == PrinterTransportType.bluetoothLowEnergy
                              ? (_bleNameController.text.isNotEmpty
                                  ? '${_bleNameController.text} (${_bleIdController.text}) [BLE]'
                                  : 'No BLE printer selected')
                              : (_btNameController.text.isNotEmpty
                                  ? '${_btNameController.text} (${_btAddressController.text}) [Classic]'
                                  : 'No Bluetooth printer selected'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        if (_devices.isNotEmpty) ...[
                          const Divider(height: OmluSpacing.lg),
                          const Text('Paired & Discovered Devices:'),
                          const SizedBox(height: OmluSpacing.xs),
                          ..._devices.map(
                            (device) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(
                                device.capabilities.contains(BluetoothCapability.ble)
                                    ? Icons.bluetooth_searching_rounded
                                    : Icons.bluetooth_connected_rounded,
                              ),
                              title: Text(device.name),
                              subtitle: Text(
                                '${device.address} ${device.isBonded ? '· Paired' : ''}',
                              ),
                              trailing: ElevatedButton(
                                onPressed: () => _selectDevice(device),
                                child: const Text('Select'),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],

              const SizedBox(height: OmluSpacing.md),

              // Shared Settings
              DropdownButtonFormField<int>(
                initialValue: _copies,
                decoration: const InputDecoration(
                  labelText: 'Number of copies',
                  border: OutlineInputBorder(),
                ),
                items: [1, 2, 3, 4, 5]
                    .map((c) => DropdownMenuItem(value: c, child: Text('$c')))
                    .toList(),
                onChanged: (v) => setState(() { if (v != null) _copies = v; }),
              ),
              const SizedBox(height: OmluSpacing.md),

              DropdownButtonFormField<PaperWidth>(
                initialValue: _paperWidth,
                decoration: const InputDecoration(
                  labelText: 'Paper width',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: PaperWidth.mm58, child: Text('58 mm')),
                  DropdownMenuItem(value: PaperWidth.mm80, child: Text('80 mm')),
                ],
                onChanged: (v) => setState(() { if (v != null) _paperWidth = v; }),
              ),
              const SizedBox(height: OmluSpacing.md),

              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Auto-cut paper'),
                subtitle: const Text('Send cut command after printing receipt.'),
                value: _autoCut,
                onChanged: _busy ? null : (v) => setState(() => _autoCut = v),
              ),

              const SizedBox(height: OmluSpacing.md),

              // Advanced Accordion Section
              ExpansionTile(
                title: const Text('Advanced Settings'),
                subtitle: const Text('Protocol overrides, UUIDs, chunking & profiles'),
                childrenPadding: const EdgeInsets.symmetric(vertical: OmluSpacing.sm),
                children: [
                  DropdownButtonFormField<PrinterProfileType>(
                    initialValue: _profile,
                    decoration: const InputDecoration(
                      labelText: 'Compatibility Profile',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: PrinterProfileType.generic58,
                        child: Text('Generic ESC/POS 58 mm'),
                      ),
                      DropdownMenuItem(
                        value: PrinterProfileType.generic80,
                        child: Text('Generic ESC/POS 80 mm'),
                      ),
                      DropdownMenuItem(
                        value: PrinterProfileType.btClassicConservative,
                        child: Text('Bluetooth Classic Conservative'),
                      ),
                      DropdownMenuItem(
                        value: PrinterProfileType.bleConservative,
                        child: Text('BLE Conservative'),
                      ),
                      DropdownMenuItem(
                        value: PrinterProfileType.custom,
                        child: Text('Custom'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) _applyProfile(v);
                    },
                  ),
                  const SizedBox(height: OmluSpacing.md),

                  DropdownButtonFormField<PrinterTransportType>(
                    initialValue: _transport,
                    decoration: const InputDecoration(
                      labelText: 'Bluetooth Protocol Override',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: PrinterTransportType.tcpLan,
                        child: Text('TCP / LAN'),
                      ),
                      DropdownMenuItem(
                        value: PrinterTransportType.bluetoothClassic,
                        child: Text('Bluetooth Classic SPP'),
                      ),
                      DropdownMenuItem(
                        value: PrinterTransportType.bluetoothLowEnergy,
                        child: Text('Bluetooth Low Energy (BLE)'),
                      ),
                    ],
                    onChanged: (v) => setState(() { if (v != null) _transport = v; }),
                  ),
                  const SizedBox(height: OmluSpacing.md),

                  if (_transport == PrinterTransportType.bluetoothClassic) ...[
                    TextField(
                      controller: _rfcommUuidController,
                      decoration: const InputDecoration(
                        labelText: 'RFCOMM UUID (Optional override)',
                        hintText: '00001101-0000-1000-8000-00805F9B34FB',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: OmluSpacing.md),
                  ],

                  if (_transport == PrinterTransportType.bluetoothLowEnergy) ...[
                    TextField(
                      controller: _bleServiceUuidController,
                      decoration: const InputDecoration(
                        labelText: 'BLE Service UUID (Optional override)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: OmluSpacing.md),
                    TextField(
                      controller: _bleCharUuidController,
                      decoration: const InputDecoration(
                        labelText: 'BLE Characteristic UUID (Optional override)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: OmluSpacing.md),
                    DropdownButtonFormField<String>(
                      initialValue: _bleWriteMode,
                      decoration: const InputDecoration(
                        labelText: 'BLE Write Mode',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'auto', child: Text('Auto Detect')),
                        DropdownMenuItem(value: 'with_response', child: Text('With Response')),
                        DropdownMenuItem(value: 'without_response', child: Text('Without Response')),
                      ],
                      onChanged: (v) => setState(() { if (v != null) _bleWriteMode = v; }),
                    ),
                    const SizedBox(height: OmluSpacing.md),
                  ],

                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _chunkSizeController,
                          decoration: const InputDecoration(
                            labelText: 'Chunk Size (bytes)',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                      const SizedBox(width: OmluSpacing.sm),
                      Expanded(
                        child: TextField(
                          controller: _delayController,
                          decoration: const InputDecoration(
                            labelText: 'Write Delay (ms)',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ],
                  ),
                ],
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
