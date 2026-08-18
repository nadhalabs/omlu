import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/printing/esc_pos_encoder.dart';
import 'package:omlu_operations/core/printing/printer_adapter.dart';
import 'package:omlu_operations/core/printing/printer_service.dart';
import 'package:omlu_operations/core/printing/receipt_data.dart';
import 'package:omlu_operations/core/storage/key_value_storage.dart';

Map<String, dynamic> receiptJson({String status = 'issued'}) => {
  'bill_number': 'BILL-1',
  'receipt_title': status == 'paid' ? 'PAYMENT RECEIPT' : 'TAX INVOICE',
  'restaurant_name': 'OMLU Cafe',
  'created_at': '2026-08-05T10:00:00Z',
  'items': [
    {
      'name': 'Meals',
      'quantity': 2,
      'unit_price': '75.00',
      'line_total': '150.00',
      'options': ['Size: Large', 'Drink: Lime'],
    },
  ],
  'subtotal': '150.00',
  'discount_amount': '0.00',
  'taxable_amount': '150.00',
  'cgst_amount': '0.00',
  'sgst_amount': '0.00',
  'igst_amount': '0.00',
  'tax_amount': '0.00',
  'grand_total': '150.00',
  'currency': 'INR',
  'payment_status': status == 'paid' ? 'PAID' : 'UNPAID',
  'is_official_invoice': status != 'draft',
  'digital_bill_url': 'https://omlu.in/receipt/secure-random-token',
};

ReceiptData receipt({String status = 'issued'}) =>
    ReceiptData.fromJson(receiptJson(status: status));

class FailingAdapter implements PrinterAdapter {
  @override
  String get name => 'failure';

  @override
  Future<void> printBytes(List<int> bytes) {
    throw const PrinterException(
      'Printing failed. The bill remains safely issued.',
    );
  }
}

class FakeTcpConnection implements TcpConnection {
  FakeTcpConnection({this.failAdd = false, this.failFlush = false});
  final bool failAdd;
  final bool failFlush;
  final bytes = <int>[];
  bool flushed = false;
  bool closed = false;
  bool destroyed = false;

  @override
  void add(List<int> value) {
    if (failAdd) throw const SocketException('raw write failure');
    bytes.addAll(value);
  }

  @override
  Future<void> flush() async {
    if (failFlush) throw const SocketException('raw flush failure');
    flushed = true;
  }

  @override
  Future<void> close() async => closed = true;

  @override
  void destroy() => destroyed = true;
}

class RecordingAdapter implements PrinterAdapter {
  int calls = 0;
  List<int> lastBytes = const [];
  @override
  String get name => 'recording';
  @override
  Future<void> printBytes(List<int> bytes) async {
    calls++;
    lastBytes = List.of(bytes);
  }
}

void main() {
  test('receipt contract parses line_total and option list', () {
    final parsed = receipt();
    expect(parsed.items.single.lineTotal, '150.00');
    expect(parsed.items.single.options, ['Size: Large', 'Drink: Lime']);
    expect(parsed.digitalBillUrl, contains('/receipt/secure-random-token'));
  });

  test(
    'printer config persists enabled, copies, paper width, host and port',
    () async {
      final storage = MemoryKeyValueStorage();
      final service = PrinterService(storage: storage);
      await service.saveConfig(
        const PrinterConfig(
          enabled: true,
          tcpIpAddress: '192.168.1.44',
          tcpPort: 9100,
          paperWidth: PaperWidth.mm80,
          copies: 2,
        ),
      );
      final reloaded = await PrinterService(storage: storage).loadConfig();
      expect(reloaded.tcpIpAddress, '192.168.1.44');
      expect(reloaded.tcpPort, 9100);
      expect(reloaded.paperWidth, PaperWidth.mm80);
      expect(reloaded.enabled, isTrue);
      expect(reloaded.copies, 2);
    },
  );

  test(
    'TCP adapter writes complete bytes, flushes and closes successfully',
    () async {
      final connection = FakeTcpConnection();
      final adapter = EscPosTcpAdapter(
        ipAddress: 'printer.local',
        connector: (_, _, _) async => connection,
      );
      await adapter.printBytes([1, 2, 3]);
      expect(connection.bytes, [1, 2, 3]);
      expect(connection.flushed, isTrue);
      expect(connection.closed, isTrue);
      expect(connection.destroyed, isFalse);
    },
  );

  test('production TCP connector writes to a real loopback socket', () async {
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final received = Completer<List<int>>();
    server.listen((socket) {
      final bytes = <int>[];
      socket.listen(bytes.addAll, onDone: () => received.complete(bytes));
    });
    await EscPosTcpAdapter(
      ipAddress: InternetAddress.loopbackIPv4.address,
      port: server.port,
    ).printBytes([0x1B, 0x40, 1, 2, 3]);
    expect(await received.future.timeout(const Duration(seconds: 2)), [
      0x1B,
      0x40,
      1,
      2,
      3,
    ]);
    await server.close();
  });

  test('TCP connection refused is a safe printer error', () async {
    final adapter = EscPosTcpAdapter(
      ipAddress: 'printer.local',
      connector: (_, _, _) =>
          throw const SocketException('connection refused raw detail'),
    );
    await expectLater(
      adapter.printBytes([1]),
      throwsA(
        isA<PrinterException>().having(
          (error) => error.message,
          'message',
          'Printer is not connected.',
        ),
      ),
    );
  });

  test('TCP connection timeout is finite and safe', () async {
    final adapter = EscPosTcpAdapter(
      ipAddress: 'printer.local',
      timeout: const Duration(milliseconds: 10),
      connector: (_, _, _) => Completer<TcpConnection>().future,
    );
    await expectLater(
      adapter.printBytes([1]),
      throwsA(
        isA<PrinterException>().having(
          (error) => error.message,
          'message',
          'Printer is not connected.',
        ),
      ),
    );
  });

  test('write failure destroys socket and hides raw exception', () async {
    final connection = FakeTcpConnection(failFlush: true);
    final adapter = EscPosTcpAdapter(
      ipAddress: 'printer.local',
      connector: (_, _, _) async => connection,
    );
    await expectLater(
      adapter.printBytes([1]),
      throwsA(
        isA<PrinterException>().having(
          (error) => error.message,
          'message',
          'Printer is not connected.',
        ),
      ),
    );
    expect(connection.destroyed, isTrue);
    expect(connection.closed, isFalse);
  });

  test('invalid host and port are rejected before connecting', () async {
    for (final adapter in [
      EscPosTcpAdapter(ipAddress: 'bad host'),
      EscPosTcpAdapter(ipAddress: 'printer.local', port: 0),
      EscPosTcpAdapter(ipAddress: 'printer.local', port: 65536),
    ]) {
      await expectLater(
        adapter.printBytes([1]),
        throwsA(isA<PrinterException>()),
      );
    }
  });

  test('58 mm and 80 mm encoding wrap long items and include ESC/POS commands', () {
    final longReceipt = ReceiptData.fromJson({
      ...receiptJson(),
      'items': [
        {
          'name':
              'Extraordinarily long biriyani platter name that must wrap safely',
          'quantity': 2,
          'unit_price': '75.00',
          'line_total': '150.00',
          'options': [
            'Preparation: Extra spicy with a very long preparation instruction',
          ],
        },
      ],
      'tax_amount': '7.50',
      'cgst_amount': '3.75',
      'sgst_amount': '3.75',
    });
    for (final width in PaperWidth.values) {
      final encoder = EscPosEncoder(paperWidth: width);
      final bytes = encoder.encodeReceipt(longReceipt);
      final text = utf8.decode(
        bytes.where((byte) => byte >= 9 && byte <= 126).toList(),
        allowMalformed: true,
      );
      expect(bytes.take(2), [0x1B, 0x40]);
      expect(bytes.skip(bytes.length - 4), [0x1D, 0x56, 0x41, 0x00]);
      expect(text, contains('Subtotal:'));
      expect(text, contains('CGST:'));
      expect(text, contains('SGST:'));
      expect(text, contains('TOTAL:'));
      expect(encoder.maxColumns, width == PaperWidth.mm58 ? 32 : 48);
      expect(
        text,
        isNot(
          contains(
            'Extraordinarily long biriyani platter name that must wrap safely',
          ),
        ),
      );
      expect(text, contains('Extraordinarily'));
      expect(text, contains('instruction'));
    }
  });

  test('test print sends one real encoded page', () async {
    final adapter = RecordingAdapter();
    final service = PrinterService(
      storage: MemoryKeyValueStorage(),
      adapterFactory: (_) => adapter,
    );
    await service.saveConfig(
      const PrinterConfig(enabled: true, tcpIpAddress: 'printer.local'),
    );
    await service.printTestPage();
    expect(adapter.calls, 1);
    expect(
      utf8.decode(adapter.lastBytes, allowMalformed: true),
      contains('OMLU PRINTER TEST'),
    );
  });

  test('print failure does not alter receipt state', () async {
    final original = receipt(status: 'paid');
    final service = PrinterService(
      storage: MemoryKeyValueStorage(),
      adapterFactory: (_) => FailingAdapter(),
    );
    await service.saveConfig(
      const PrinterConfig(enabled: true, tcpIpAddress: 'printer'),
    );
    await expectLater(
      service.printReceipt(original),
      throwsA(isA<PrinterException>()),
    );
    expect(original.paymentStatus, 'PAID');
    expect(original.grandTotal, '150.00');
  });

  test(
    'issued bill and paid receipt allow safe reprints and configured copies',
    () async {
      final adapter = RecordingAdapter();
      final service = PrinterService(
        storage: MemoryKeyValueStorage(),
        adapterFactory: (_) => adapter,
      );
      await service.saveConfig(
        const PrinterConfig(enabled: true, tcpIpAddress: 'printer', copies: 2),
      );
      await service.printReceipt(receipt());
      await service.printReceipt(receipt(status: 'paid'));
      expect(adapter.calls, 4);
    },
  );

  test('unsupported transports always fail explicitly', () async {
    for (final name in ['Bluetooth', 'USB', 'Android system']) {
      await expectLater(
        UnsupportedPrinterAdapter(name).printBytes([1]),
        throwsA(
          isA<PrinterException>().having(
            (error) => error.message,
            'message',
            contains('not supported'),
          ),
        ),
      );
    }
  });

  test('draft receipt cannot be printed', () async {
    final service = PrinterService(storage: MemoryKeyValueStorage());
    await expectLater(
      service.printReceipt(receipt(status: 'draft')),
      throwsA(isA<PrinterException>()),
    );
  });
}
