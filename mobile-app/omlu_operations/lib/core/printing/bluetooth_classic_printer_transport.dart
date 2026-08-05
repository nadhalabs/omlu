import 'dart:async';
import 'bluetooth_platform.dart';
import 'printer_adapter.dart';
import 'printer_transport.dart';

class BluetoothClassicPrinterTransport implements PrinterTransport {
  BluetoothClassicPrinterTransport({
    required this.deviceAddress,
    this.deviceName = 'Bluetooth Classic Printer',
    this.uuid,
    this.allowInsecure = false,
    this.chunkSize = 128,
    this.delayMs = 20,
    this.connectTimeout = const Duration(seconds: 5),
    OmluBluetoothPlatform? platform,
  }) : _platform = platform ?? MethodChannelBluetoothPlatform();

  final String deviceAddress;
  final String deviceName;
  final String? uuid;
  final bool allowInsecure;
  final int chunkSize;
  final int delayMs;
  final Duration connectTimeout;
  final OmluBluetoothPlatform _platform;

  @override
  String get name => '$deviceName ($deviceAddress)';

  @override
  PrinterTransportType get type => PrinterTransportType.bluetoothClassic;

  @override
  Future<List<DiscoveredPrinterDevice>> pairedDevices() async {
    return _platform.getPairedDevices();
  }

  @override
  Stream<DiscoveredPrinterDevice> discover({
    Duration timeout = const Duration(seconds: 10),
  }) {
    return _platform.startScan();
  }

  @override
  Future<void> connect() async {
    if (deviceAddress.trim().isEmpty) {
      throw const PrinterException('Select a Bluetooth Classic printer.');
    }
    final state = await _platform.checkState();
    if (!state.supported) {
      throw const PrinterException('Bluetooth is not supported on this device.');
    }
    if (!state.enabled) {
      throw const PrinterException('Bluetooth is turned off on this device.');
    }
    if (!state.hasConnectPermission) {
      throw const PrinterException('Bluetooth permission was denied.');
    }

    try {
      final connected = await _platform
          .connectClassic(
            address: deviceAddress,
            uuid: uuid,
            allowInsecure: allowInsecure,
          )
          .timeout(connectTimeout);
      if (!connected) {
        throw const PrinterException('Printer is not connected.');
      }
    } on TimeoutException {
      throw const PrinterException('Printer connection timed out.');
    } catch (e) {
      if (e is PrinterException) rethrow;
      throw const PrinterException('Printer is not connected.');
    }
  }

  @override
  Future<void> write(List<int> bytes) async {
    if (bytes.isEmpty) {
      throw const PrinterException(
        'Printing failed. The bill remains safely issued.',
      );
    }
    try {
      await _platform.writeClassic(
        bytes: bytes,
        chunkSize: chunkSize,
        delayMs: delayMs,
      );
    } catch (e) {
      if (e is PrinterException) rethrow;
      throw const PrinterException(
        'Printing failed. The bill remains safely issued.',
      );
    }
  }

  @override
  Future<void> flush() async {
    try {
      await _platform.flushClassic();
    } catch (_) {}
  }

  @override
  Future<void> disconnect() async {
    try {
      await _platform.disconnectClassic();
    } catch (_) {}
  }

  @override
  Future<bool> testConnection() async {
    try {
      await connect();
      await disconnect();
      return true;
    } catch (_) {
      return false;
    }
  }
}
