import 'dart:async';
import 'bluetooth_platform.dart';
import 'printer_adapter.dart';
import 'printer_transport.dart';

class TcpPrinterTransport implements PrinterTransport {
  TcpPrinterTransport({
    required this.host,
    this.port = 9100,
    this.timeout = const Duration(seconds: 5),
    TcpConnector? connector,
  }) : _adapter = EscPosTcpAdapter(
         ipAddress: host,
         port: port,
         timeout: timeout,
         connector: connector,
       );

  final String host;
  final int port;
  final Duration timeout;
  final EscPosTcpAdapter _adapter;

  @override
  String get name => 'TCP/LAN ($host:$port)';

  @override
  PrinterTransportType get type => PrinterTransportType.tcpLan;

  @override
  Future<List<DiscoveredPrinterDevice>> pairedDevices() async => [];

  @override
  Stream<DiscoveredPrinterDevice> discover({
    Duration timeout = const Duration(seconds: 10),
  }) => Stream.empty();

  @override
  Future<void> connect() async {
    _adapter.validateConfiguration();
  }

  @override
  Future<void> write(List<int> bytes) async {
    await _adapter.printBytes(bytes);
  }

  @override
  Future<void> flush() async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<bool> testConnection() async {
    try {
      await connect();
      return true;
    } catch (_) {
      return false;
    }
  }
}
