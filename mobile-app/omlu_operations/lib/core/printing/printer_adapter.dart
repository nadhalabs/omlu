import 'dart:async';
import 'dart:io';

class PrinterException implements Exception {
  const PrinterException(this.message);
  final String message;

  @override
  String toString() => message;
}

abstract class PrinterAdapter {
  Future<void> printBytes(List<int> bytes);
  String get name;
}

abstract interface class TcpConnection {
  void add(List<int> bytes);
  Future<void> flush();
  Future<void> close();
  void destroy();
}

class IoTcpConnection implements TcpConnection {
  IoTcpConnection(this.socket);
  final Socket socket;

  @override
  void add(List<int> bytes) => socket.add(bytes);
  @override
  Future<void> flush() => socket.flush();
  @override
  Future<void> close() async => socket.close();
  @override
  void destroy() => socket.destroy();
}

typedef TcpConnector =
    Future<TcpConnection> Function(String host, int port, Duration timeout);

class EscPosTcpAdapter implements PrinterAdapter {
  EscPosTcpAdapter({
    required this.ipAddress,
    this.port = 9100,
    this.timeout = const Duration(seconds: 5),
    TcpConnector? connector,
  }) : _connector = connector ?? _connect;

  final String ipAddress;
  final int port;
  final Duration timeout;
  final TcpConnector _connector;

  static Future<TcpConnection> _connect(
    String host,
    int port,
    Duration timeout,
  ) async =>
      IoTcpConnection(await Socket.connect(host, port, timeout: timeout));

  void validateConfiguration() {
    final host = ipAddress.trim();
    final hostname = RegExp(
      r'^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$',
    );
    final isIpAddress = InternetAddress.tryParse(host) != null;
    if (host.isEmpty ||
        host.length > 253 ||
        (!isIpAddress && !hostname.hasMatch(host)) ||
        host.contains('..')) {
      throw const PrinterException('Enter a valid printer host or IP address.');
    }
    if (port < 1 || port > 65535) {
      throw const PrinterException('Enter a valid printer port.');
    }
  }

  @override
  String get name => 'TCP/LAN ($ipAddress:$port)';

  @override
  Future<void> printBytes(List<int> bytes) async {
    validateConfiguration();
    if (bytes.isEmpty) {
      throw const PrinterException(
        'Printing failed. The bill remains safely issued.',
      );
    }
    TcpConnection? connection;
    try {
      connection = await _connector(
        ipAddress.trim(),
        port,
        timeout,
      ).timeout(timeout);
      connection.add(bytes);
      await connection.flush().timeout(timeout);
      await connection.close().timeout(timeout);
      connection = null;
    } on TimeoutException {
      throw const PrinterException('Printer is not connected.');
    } on SocketException {
      throw const PrinterException('Printer is not connected.');
    } catch (_) {
      throw const PrinterException(
        'Printing failed. The bill remains safely issued.',
      );
    } finally {
      connection?.destroy();
    }
  }
}

class UnsupportedPrinterAdapter implements PrinterAdapter {
  const UnsupportedPrinterAdapter(this.transportName);
  final String transportName;

  @override
  String get name => transportName;

  @override
  Future<void> printBytes(List<int> bytes) async {
    throw PrinterException('$transportName printing is not supported yet.');
  }
}
