import 'receipt_data.dart';

class PrintJob {
  PrintJob({
    required this.printJobId,
    required this.billId,
    required this.receiptType,
    required this.receiptPayload,
    required this.printerConfigSnapshot,
    required this.createdAt,
    this.retryCount = 0,
  });

  final String printJobId;
  final String billId;
  final String receiptType;
  final ReceiptData receiptPayload;
  final Map<String, Object?> printerConfigSnapshot;
  final DateTime createdAt;
  int retryCount;

  Map<String, Object?> toJson() => {
    'print_job_id': printJobId,
    'bill_id': billId,
    'receipt_type': receiptType,
    'receipt_payload': receiptPayload.toJson(),
    'printer_config': printerConfigSnapshot,
    'created_at': createdAt.toIso8601String(),
    'retry_count': retryCount,
  };
}
