import 'dart:async';
import 'bluetooth_platform.dart';
import 'printer_adapter.dart';
import 'printer_transport.dart';

class BlePrinterTransport implements PrinterTransport {
  BlePrinterTransport({
    required this.deviceIdentifier,
    this.deviceName = 'BLE Printer',
    this.serviceUuid,
    this.writeCharacteristicUuid,
    this.writeMode = 'auto',
    this.chunkSize = 20,
    this.delayMs = 20,
    this.connectTimeout = const Duration(seconds: 5),
    OmluBluetoothPlatform? platform,
  }) : _platform = platform ?? MethodChannelBluetoothPlatform();

  final String deviceIdentifier;
  final String deviceName;
  final String? serviceUuid;
  final String? writeCharacteristicUuid;
  final String writeMode;
  final int chunkSize;
  final int delayMs;
  final Duration connectTimeout;
  final OmluBluetoothPlatform _platform;

  @override
  String get name => '$deviceName ($deviceIdentifier)';

  @override
  PrinterTransportType get type => PrinterTransportType.bluetoothLowEnergy;

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
    if (deviceIdentifier.trim().isEmpty) {
      throw const PrinterException('Select a BLE printer device.');
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
      final services = await _platform
          .connectBle(
            address: deviceIdentifier,
            timeoutMs: connectTimeout.inMilliseconds,
          )
          .timeout(connectTimeout);
      if (services.isEmpty) {
        throw const PrinterException(
          'No writable BLE services found on printer.',
        );
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
      await _platform.writeBle(
        serviceUuid: serviceUuid,
        characteristicUuid: writeCharacteristicUuid,
        bytes: bytes,
        writeMode: writeMode,
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
  Future<void> flush() async {}

  @override
  Future<void> disconnect() async {
    try {
      await _platform.disconnectBle();
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
