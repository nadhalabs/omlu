import 'dart:async';
import 'print_job.dart';
import 'printer_adapter.dart';
import 'printer_transport.dart';

class PrintJobCoordinator {
  bool _isJobActive = false;
  String? _activeJobId;

  Future<void> executeJob({
    required PrintJob job,
    required PrinterTransport transport,
    required List<int> encodedBytes,
  }) async {
    if (_isJobActive) {
      throw const PrinterException('A print job is already in progress.');
    }
    if (_activeJobId == job.printJobId && job.retryCount == 0) {
      throw const PrinterException('Duplicate print job rejected.');
    }

    _isJobActive = true;
    _activeJobId = job.printJobId;

    try {
      await transport.connect();
      await transport.write(encodedBytes);
      await transport.flush();
    } finally {
      await transport.disconnect();
      _isJobActive = false;
    }
  }
}
