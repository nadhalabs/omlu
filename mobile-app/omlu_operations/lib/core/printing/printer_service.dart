import 'dart:convert';

import '../storage/key_value_storage.dart';
import 'esc_pos_encoder.dart';
import 'printer_adapter.dart';
import 'receipt_data.dart';

class PrinterConfig {
  const PrinterConfig({
    this.enabled = false,
    this.tcpIpAddress = '',
    this.tcpPort = 9100,
    this.paperWidth = PaperWidth.mm58,
    this.copies = 1,
    this.autoCut = true,
  });

  final bool enabled;
  final String tcpIpAddress;
  final int tcpPort;
  final PaperWidth paperWidth;
  final int copies;
  final bool autoCut;

  bool get isConfigured =>
      enabled && tcpIpAddress.trim().isNotEmpty && tcpPort > 0;

  Map<String, Object?> toJson() => {
    'enabled': enabled,
    'tcp_ip_address': tcpIpAddress,
    'tcp_port': tcpPort,
    'paper_width': paperWidth.name,
    'copies': copies,
    'auto_cut': autoCut,
  };

  factory PrinterConfig.fromJson(Map<String, Object?> json) => PrinterConfig(
    enabled: json['enabled'] == true,
    tcpIpAddress: json['tcp_ip_address']?.toString() ?? '',
    tcpPort: int.tryParse(json['tcp_port']?.toString() ?? '') ?? 9100,
    paperWidth: json['paper_width'] == PaperWidth.mm80.name
        ? PaperWidth.mm80
        : PaperWidth.mm58,
    copies: int.tryParse(json['copies']?.toString() ?? '') ?? 1,
    autoCut: json['auto_cut'] == null || json['auto_cut'] == true,
  );
}

class PrinterService {
  PrinterService({
    required KeyValueStorage storage,
    PrinterAdapter Function(PrinterConfig config)? adapterFactory,
  }) : _storage = storage,
       _adapterFactory =
           adapterFactory ??
           ((config) => EscPosTcpAdapter(
             ipAddress: config.tcpIpAddress,
             port: config.tcpPort,
           ));

  static const _storageKey = 'omlu_tcp_printer_config_v1';
  final KeyValueStorage _storage;
  final PrinterAdapter Function(PrinterConfig config) _adapterFactory;
  PrinterConfig _config = const PrinterConfig();

  PrinterConfig get config => _config;

  Future<PrinterConfig> loadConfig() async {
    final stored = await _storage.read(_storageKey);
    if (stored != null) {
      _config = PrinterConfig.fromJson(
        Map<String, Object?>.from(jsonDecode(stored) as Map),
      );
    }
    return _config;
  }

  Future<void> saveConfig(PrinterConfig config) async {
    if (config.tcpPort < 1 || config.tcpPort > 65535) {
      throw const PrinterException('Enter a valid printer port.');
    }
    if (config.copies < 1 || config.copies > 5) {
      throw const PrinterException('Enter between 1 and 5 copies.');
    }
    if (config.enabled) {
      EscPosTcpAdapter(
        ipAddress: config.tcpIpAddress,
        port: config.tcpPort,
      ).validateConfiguration();
    }
    _config = config;
    await _storage.write(_storageKey, jsonEncode(config.toJson()));
  }

  Future<void> printReceipt(ReceiptData receipt) async {
    if (!receipt.isOfficialInvoice) {
      throw const PrinterException(
        'Draft bills cannot be printed as official invoices.',
      );
    }
    if (!_config.isConfigured) {
      throw const PrinterException('Printer is not connected.');
    }
    final bytes = EscPosEncoder(
      paperWidth: _config.paperWidth,
    ).encodeReceipt(receipt);
    for (var copy = 0; copy < _config.copies; copy++) {
      await _adapterFactory(_config).printBytes(bytes);
    }
  }

  Future<void> printTestPage() async {
    if (!_config.isConfigured) {
      throw const PrinterException('Printer is not connected.');
    }
    final bytes = EscPosEncoder(
      paperWidth: _config.paperWidth,
    ).encodeTestPage();
    await _adapterFactory(_config).printBytes(bytes);
  }
}
