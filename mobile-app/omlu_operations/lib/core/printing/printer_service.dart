import 'dart:convert';

import '../storage/key_value_storage.dart';
import 'ble_printer_transport.dart';
import 'bluetooth_classic_printer_transport.dart';
import 'bluetooth_platform.dart';
import 'esc_pos_encoder.dart';
import 'print_job.dart';
import 'print_job_coordinator.dart';
import 'printer_adapter.dart';
import 'printer_profile.dart';
import 'printer_transport.dart';
import 'receipt_data.dart';
import 'tcp_printer_transport.dart';

class PrinterConfig {
  const PrinterConfig({
    this.enabled = false,
    this.transport = PrinterTransportType.tcpLan,
    this.profile = PrinterProfileType.generic58,
    this.paperWidth = PaperWidth.mm58,
    this.copies = 1,
    this.autoCut = true,
    this.encoding = 'utf-8',
    this.charactersPerLine = 32,
    this.connectTimeoutSeconds = 5,
    this.writeTimeoutSeconds = 5,
    this.chunkSize = 128,
    this.interChunkDelayMs = 20,
    this.qrMode = QrPrintMode.raster,

    // TCP
    this.tcpIpAddress = '',
    this.tcpPort = 9100,

    // Bluetooth Classic
    this.btDeviceName = '',
    this.btDeviceAddress = '',
    this.btRfcommUuid,
    this.allowInsecureClassic = false,

    // BLE
    this.bleDeviceName = '',
    this.bleDeviceIdentifier = '',
    this.bleServiceUuid,
    this.bleWriteCharacteristicUuid,
    this.bleWriteMode = 'auto',
  });

  final bool enabled;
  final PrinterTransportType transport;
  final PrinterProfileType profile;
  final PaperWidth paperWidth;
  final int copies;
  final bool autoCut;
  final String encoding;
  final int charactersPerLine;
  final int connectTimeoutSeconds;
  final int writeTimeoutSeconds;
  final int chunkSize;
  final int interChunkDelayMs;
  final QrPrintMode qrMode;

  final String tcpIpAddress;
  final int tcpPort;

  final String btDeviceName;
  final String btDeviceAddress;
  final String? btRfcommUuid;
  final bool allowInsecureClassic;

  final String bleDeviceName;
  final String bleDeviceIdentifier;
  final String? bleServiceUuid;
  final String? bleWriteCharacteristicUuid;
  final String bleWriteMode;

  bool get isConfigured {
    if (!enabled) return false;
    switch (transport) {
      case PrinterTransportType.tcpLan:
        return tcpIpAddress.trim().isNotEmpty && tcpPort > 0;
      case PrinterTransportType.bluetoothClassic:
        return btDeviceAddress.trim().isNotEmpty;
      case PrinterTransportType.bluetoothLowEnergy:
        return bleDeviceIdentifier.trim().isNotEmpty;
    }
  }

  Map<String, Object?> toJson() => {
    'enabled': enabled,
    'transport': transport.name,
    'profile': profile.name,
    'paper_width': paperWidth.name,
    'copies': copies,
    'auto_cut': autoCut,
    'encoding': encoding,
    'characters_per_line': charactersPerLine,
    'connect_timeout_seconds': connectTimeoutSeconds,
    'write_timeout_seconds': writeTimeoutSeconds,
    'chunk_size': chunkSize,
    'inter_chunk_delay_ms': interChunkDelayMs,
    'qr_mode': qrMode.name,
    'tcp_ip_address': tcpIpAddress,
    'tcp_port': tcpPort,
    'bt_device_name': btDeviceName,
    'bt_device_address': btDeviceAddress,
    'bt_rfcomm_uuid': btRfcommUuid,
    'allow_insecure_classic': allowInsecureClassic,
    'ble_device_name': bleDeviceName,
    'ble_device_identifier': bleDeviceIdentifier,
    'ble_service_uuid': bleServiceUuid,
    'ble_write_characteristic_uuid': bleWriteCharacteristicUuid,
    'ble_write_mode': bleWriteMode,
  };

  factory PrinterConfig.fromJson(Map<String, Object?> json) {
    // Robust migration logic from legacy TCP JSON
    final rawTransport = json['transport']?.toString();
    final transport = PrinterTransportType.values.firstWhere(
      (e) => e.name == rawTransport,
      orElse: () => PrinterTransportType.tcpLan,
    );

    final rawPaperWidth = json['paper_width']?.toString();
    final paperWidth = rawPaperWidth == PaperWidth.mm80.name
        ? PaperWidth.mm80
        : PaperWidth.mm58;

    final rawProfile = json['profile']?.toString();
    final profile = PrinterProfileType.values.firstWhere(
      (e) => e.name == rawProfile,
      orElse: () => paperWidth == PaperWidth.mm80
          ? PrinterProfileType.generic80
          : PrinterProfileType.generic58,
    );

    return PrinterConfig(
      enabled: json['enabled'] == true,
      transport: transport,
      profile: profile,
      paperWidth: paperWidth,
      copies: int.tryParse(json['copies']?.toString() ?? '') ?? 1,
      autoCut: json['auto_cut'] == null || json['auto_cut'] == true,
      encoding: json['encoding']?.toString() ?? 'utf-8',
      charactersPerLine:
          int.tryParse(json['characters_per_line']?.toString() ?? '') ??
          (paperWidth == PaperWidth.mm80 ? 48 : 32),
      connectTimeoutSeconds:
          int.tryParse(json['connect_timeout_seconds']?.toString() ?? '') ?? 5,
      writeTimeoutSeconds:
          int.tryParse(json['write_timeout_seconds']?.toString() ?? '') ?? 5,
      chunkSize:
          int.tryParse(json['chunk_size']?.toString() ?? '') ??
          (transport == PrinterTransportType.bluetoothLowEnergy ? 20 : 128),
      interChunkDelayMs:
          int.tryParse(json['inter_chunk_delay_ms']?.toString() ?? '') ?? 20,
      qrMode: QrPrintMode.values.firstWhere(
        (mode) => mode.name == json['qr_mode']?.toString(),
        orElse: () => QrPrintMode.raster,
      ),

      tcpIpAddress: json['tcp_ip_address']?.toString() ?? '',
      tcpPort: int.tryParse(json['tcp_port']?.toString() ?? '') ?? 9100,

      btDeviceName: json['bt_device_name']?.toString() ?? '',
      btDeviceAddress: json['bt_device_address']?.toString() ?? '',
      btRfcommUuid: json['bt_rfcomm_uuid']?.toString(),
      allowInsecureClassic: json['allow_insecure_classic'] == true,

      bleDeviceName: json['ble_device_name']?.toString() ?? '',
      bleDeviceIdentifier: json['ble_device_identifier']?.toString() ?? '',
      bleServiceUuid: json['ble_service_uuid']?.toString(),
      bleWriteCharacteristicUuid: json['ble_write_characteristic_uuid']
          ?.toString(),
      bleWriteMode: json['ble_write_mode']?.toString() ?? 'auto',
    );
  }
}

class PrinterService {
  PrinterService({
    required KeyValueStorage storage,
    PrinterTransport Function(PrinterConfig config)? transportFactory,
    PrinterAdapter Function(PrinterConfig config)? legacyAdapterFactory,
    PrinterAdapter Function(PrinterConfig config)? adapterFactory,
    OmluBluetoothPlatform? bluetoothPlatform,
    PrintJobCoordinator? coordinator,
  }) : _storage = storage,
       _transportFactory = transportFactory,
       _legacyAdapterFactory = legacyAdapterFactory ?? adapterFactory,
       _bluetoothPlatform =
           bluetoothPlatform ?? MethodChannelBluetoothPlatform(),
       _coordinator = coordinator ?? PrintJobCoordinator();

  static const _storageKey = 'omlu_tcp_printer_config_v1';
  final KeyValueStorage _storage;
  final PrinterTransport Function(PrinterConfig config)? _transportFactory;
  final PrinterAdapter Function(PrinterConfig config)? _legacyAdapterFactory;
  final OmluBluetoothPlatform _bluetoothPlatform;
  final PrintJobCoordinator _coordinator;
  PrinterConfig _config = const PrinterConfig();

  PrinterConfig get config => _config;

  PrinterTransport createTransport(PrinterConfig config) {
    final factory = _transportFactory;
    if (factory != null) {
      return factory(config);
    }

    switch (config.transport) {
      case PrinterTransportType.tcpLan:
        return TcpPrinterTransport(
          host: config.tcpIpAddress,
          port: config.tcpPort,
          timeout: Duration(seconds: config.connectTimeoutSeconds),
        );
      case PrinterTransportType.bluetoothClassic:
        return BluetoothClassicPrinterTransport(
          deviceAddress: config.btDeviceAddress,
          deviceName: config.btDeviceName.isNotEmpty
              ? config.btDeviceName
              : 'Bluetooth Classic Printer',
          uuid: config.btRfcommUuid,
          allowInsecure: config.allowInsecureClassic,
          chunkSize: config.chunkSize,
          delayMs: config.interChunkDelayMs,
          connectTimeout: Duration(seconds: config.connectTimeoutSeconds),
          platform: _bluetoothPlatform,
        );
      case PrinterTransportType.bluetoothLowEnergy:
        return BlePrinterTransport(
          deviceIdentifier: config.bleDeviceIdentifier,
          deviceName: config.bleDeviceName.isNotEmpty
              ? config.bleDeviceName
              : 'BLE Printer',
          serviceUuid: config.bleServiceUuid,
          writeCharacteristicUuid: config.bleWriteCharacteristicUuid,
          writeMode: config.bleWriteMode,
          chunkSize: config.chunkSize,
          delayMs: config.interChunkDelayMs,
          connectTimeout: Duration(seconds: config.connectTimeoutSeconds),
          platform: _bluetoothPlatform,
        );
    }
  }

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
    if (config.copies < 1 || config.copies > 5) {
      throw const PrinterException('Enter between 1 and 5 copies.');
    }
    if (config.enabled) {
      if (config.transport == PrinterTransportType.tcpLan) {
        if (config.tcpPort < 1 || config.tcpPort > 65535) {
          throw const PrinterException('Enter a valid printer port.');
        }
        EscPosTcpAdapter(
          ipAddress: config.tcpIpAddress,
          port: config.tcpPort,
        ).validateConfiguration();
      } else if (config.transport == PrinterTransportType.bluetoothClassic) {
        if (config.btDeviceAddress.trim().isEmpty) {
          throw const PrinterException(
            'Select a Bluetooth Classic printer address.',
          );
        }
      } else if (config.transport == PrinterTransportType.bluetoothLowEnergy) {
        if (config.bleDeviceIdentifier.trim().isEmpty) {
          throw const PrinterException('Select a BLE printer device.');
        }
      }
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

    final legacyFactory = _legacyAdapterFactory;
    if (legacyFactory != null) {
      final bytes = EscPosEncoder(
        paperWidth: _config.paperWidth,
        qrMode: _config.qrMode,
      ).encodeReceipt(receipt);
      for (var copy = 0; copy < _config.copies; copy++) {
        await legacyFactory(_config).printBytes(bytes);
      }
      return;
    }

    final bytes = EscPosEncoder(
      paperWidth: _config.paperWidth,
      qrMode: _config.qrMode,
    ).encodeReceipt(receipt);

    final transport = createTransport(_config);
    final printJob = PrintJob(
      printJobId:
          'job-${receipt.billNumber}-${DateTime.now().millisecondsSinceEpoch}',
      billId: receipt.billNumber,
      receiptType: receipt.receiptTitle,
      receiptPayload: receipt,
      printerConfigSnapshot: _config.toJson(),
      createdAt: DateTime.now(),
    );

    for (var copy = 0; copy < _config.copies; copy++) {
      await _coordinator.executeJob(
        job: printJob,
        transport: transport,
        encodedBytes: bytes,
      );
    }
  }

  Future<void> printTestPage() async {
    if (!_config.isConfigured) {
      throw const PrinterException('Printer is not connected.');
    }

    final legacyFactory = _legacyAdapterFactory;
    if (legacyFactory != null) {
      final bytes = EscPosEncoder(
        paperWidth: _config.paperWidth,
      ).encodeTestPage();
      await legacyFactory(_config).printBytes(bytes);
      return;
    }

    final bytes = EscPosEncoder(
      paperWidth: _config.paperWidth,
    ).encodeTestPage();

    final transport = createTransport(_config);
    final printJob = PrintJob(
      printJobId: 'test-job-${DateTime.now().millisecondsSinceEpoch}',
      billId: 'TEST-PAGE',
      receiptType: 'TEST_PAGE',
      receiptPayload: ReceiptData.fromJson({
        'bill_number': 'TEST',
        'receipt_title': 'TEST PAGE',
        'restaurant_name': 'OMLU Test',
        'created_at': DateTime.now().toIso8601String(),
        'items': [],
        'subtotal': '0.00',
        'discount_amount': '0.00',
        'tax_amount': '0.00',
        'grand_total': '0.00',
        'currency': 'INR',
        'is_official_invoice': true,
      }),
      printerConfigSnapshot: _config.toJson(),
      createdAt: DateTime.now(),
    );

    await _coordinator.executeJob(
      job: printJob,
      transport: transport,
      encodedBytes: bytes,
    );
  }
}
