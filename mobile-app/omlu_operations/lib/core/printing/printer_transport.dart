import 'bluetooth_platform.dart';

enum PrinterTransportType { tcpLan, bluetoothClassic, bluetoothLowEnergy }

abstract class PrinterTransport {
  String get name;
  PrinterTransportType get type;

  Future<List<DiscoveredPrinterDevice>> pairedDevices();
  Stream<DiscoveredPrinterDevice> discover({
    Duration timeout = const Duration(seconds: 10),
  });
  Future<void> connect();
  Future<void> write(List<int> bytes);
  Future<void> flush();
  Future<void> disconnect();
  Future<bool> testConnection();
}
