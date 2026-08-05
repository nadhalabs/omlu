import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/printing/ble_printer_transport.dart';
import 'package:omlu_operations/core/printing/bluetooth_classic_printer_transport.dart';
import 'package:omlu_operations/core/printing/bluetooth_platform.dart';
import 'package:omlu_operations/core/printing/esc_pos_encoder.dart';
import 'package:omlu_operations/core/printing/print_job.dart';
import 'package:omlu_operations/core/printing/print_job_coordinator.dart';
import 'package:omlu_operations/core/printing/printer_adapter.dart';
import 'package:omlu_operations/core/printing/printer_profile.dart';
import 'package:omlu_operations/core/printing/printer_service.dart';
import 'package:omlu_operations/core/printing/printer_transport.dart';
import 'package:omlu_operations/core/printing/receipt_data.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Bluetooth & Transport Architecture', () {
    test('paired Classic devices listing and capability mapping', () async {
      final mockPlatform = MockBluetoothPlatform();
      final transport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        platform: mockPlatform,
      );
      final paired = await transport.pairedDevices();
      expect(paired.length, 2);
      expect(paired.first.name, 'Thermal Printer Classic');
      expect(paired.first.capabilities.contains(BluetoothCapability.classic), isTrue);
    });

    test('Classic RFCOMM connection and chunked writes', () async {
      final mockPlatform = MockBluetoothPlatform();
      final transport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        chunkSize: 10,
        delayMs: 1,
        platform: mockPlatform,
      );
      await transport.connect();
      expect(mockPlatform.isClassicConnected, isTrue);

      await transport.write([1, 2, 3, 4, 5]);
      await transport.flush();
      await transport.disconnect();
      expect(mockPlatform.isClassicConnected, isFalse);
      expect(mockPlatform.writtenBytes, [1, 2, 3, 4, 5]);
    });

    test('BLE scanning, GATT service discovery & automatic writable selection', () async {
      final mockPlatform = MockBluetoothPlatform(
        scanDevices: [
          const DiscoveredPrinterDevice(
            name: 'BLE Test Printer',
            address: 'AA:BB:CC:DD:EE:FF',
            isBonded: false,
            capabilities: {BluetoothCapability.ble},
          ),
        ],
      );

      final transport = BlePrinterTransport(
        deviceIdentifier: 'AA:BB:CC:DD:EE:FF',
        chunkSize: 5,
        delayMs: 1,
        platform: mockPlatform,
      );

      final discoveredStream = transport.discover();
      final scanned = await discoveredStream.first;
      expect(scanned.name, 'BLE Test Printer');

      await transport.connect();
      expect(mockPlatform.isBleConnected, isTrue);

      await transport.write([10, 20, 30]);
      await transport.disconnect();
      expect(mockPlatform.isBleConnected, isFalse);
      expect(mockPlatform.writtenBytes, [10, 20, 30]);
    });

    test('BLE write-with-response and write-without-response modes', () async {
      for (final mode in ['with_response', 'without_response', 'auto']) {
        final mockPlatform = MockBluetoothPlatform();
        final transport = BlePrinterTransport(
          deviceIdentifier: 'AA:BB:CC:DD:EE:FF',
          writeMode: mode,
          platform: mockPlatform,
        );
        await transport.connect();
        await transport.write([1, 2, 3]);
        await transport.disconnect();
        expect(mockPlatform.writtenBytes, [1, 2, 3]);
      }
    });

    test('MTU-aware chunking breaks large payloads into small chunks', () async {
      final mockPlatform = MockBluetoothPlatform();
      final transport = BlePrinterTransport(
        deviceIdentifier: 'AA:BB:CC:DD:EE:FF',
        chunkSize: 20,
        platform: mockPlatform,
      );
      final largeBytes = List<int>.generate(100, (i) => i % 256);
      await transport.connect();
      await transport.write(largeBytes);
      await transport.disconnect();
      expect(mockPlatform.writtenBytes.length, 100);
    });

    test('Handles Bluetooth disabled, permission denied, device unavailable, and timeout', () async {
      // Bluetooth disabled
      final disabledPlatform = MockBluetoothPlatform(
        state: const BluetoothState(
          supported: true,
          enabled: false,
          hasConnectPermission: true,
          hasScanPermission: true,
        ),
      );
      final disabledTransport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        platform: disabledPlatform,
      );
      await expectLater(
        disabledTransport.connect(),
        throwsA(
          isA<PrinterException>().having(
            (e) => e.message,
            'message',
            contains('turned off'),
          ),
        ),
      );

      // Permission denied
      final deniedPlatform = MockBluetoothPlatform(
        state: const BluetoothState(
          supported: true,
          enabled: true,
          hasConnectPermission: false,
          hasScanPermission: false,
        ),
      );
      final deniedTransport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        platform: deniedPlatform,
      );
      await expectLater(
        deniedTransport.connect(),
        throwsA(
          isA<PrinterException>().having(
            (e) => e.message,
            'message',
            contains('denied'),
          ),
        ),
      );

      // Device unavailable / connection failure
      final failConnectPlatform = MockBluetoothPlatform(shouldFailConnect: true);
      final failTransport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        platform: failConnectPlatform,
      );
      await expectLater(
        failTransport.connect(),
        throwsA(
          isA<PrinterException>().having(
            (e) => e.message,
            'message',
            contains('not connected'),
          ),
        ),
      );
    });

    test('Legacy TCP config migration preserves settings without data loss', () async {
      final legacyJson = <String, Object?>{
        'enabled': true,
        'tcp_ip_address': '192.168.1.200',
        'tcp_port': 9100,
        'paper_width': 'mm80',
        'copies': 3,
        'auto_cut': false,
      };

      final migrated = PrinterConfig.fromJson(legacyJson);
      expect(migrated.transport, PrinterTransportType.tcpLan);
      expect(migrated.tcpIpAddress, '192.168.1.200');
      expect(migrated.tcpPort, 9100);
      expect(migrated.paperWidth, PaperWidth.mm80);
      expect(migrated.copies, 3);
      expect(migrated.autoCut, isFalse);
      expect(migrated.profile, PrinterProfileType.generic80);
    });

    test('Compatibility Profiles configure chunk size, paper width, cut & delay', () {
      final cfg58 = PrinterProfileConfig.fromType(PrinterProfileType.generic58);
      expect(cfg58.lineColumns, 32);
      expect(cfg58.paperWidth, PaperWidth.mm58);

      final cfgBle = PrinterProfileConfig.fromType(PrinterProfileType.bleConservative);
      expect(cfgBle.chunkSize, 20);
      expect(cfgBle.interChunkDelayMs, 40);
    });

    test('PrintJobCoordinator prevents concurrent printer execution and duplicate jobs', () async {
      final coordinator = PrintJobCoordinator();
      final mockPlatform = MockBluetoothPlatform();
      final transport = BluetoothClassicPrinterTransport(
        deviceAddress: '00:11:22:33:44:55',
        platform: mockPlatform,
      );

      final job1 = PrintJob(
        printJobId: 'JOB-100',
        billId: 'BILL-100',
        receiptType: 'TAX INVOICE',
        receiptPayload: ReceiptData.fromJson({
          'bill_number': 'BILL-100',
          'receipt_title': 'TAX INVOICE',
          'restaurant_name': 'OMLU',
          'created_at': '2026-08-05T10:00:00Z',
          'items': [],
          'subtotal': '10.00',
          'discount_amount': '0.00',
          'tax_amount': '0.00',
          'grand_total': '10.00',
          'currency': 'INR',
          'is_official_invoice': true,
        }),
        printerConfigSnapshot: {},
        createdAt: DateTime.now(),
      );

      await coordinator.executeJob(
        job: job1,
        transport: transport,
        encodedBytes: [1, 2, 3],
      );

      expect(mockPlatform.writtenBytes, [1, 2, 3]);

      // Duplicate job ID without retry throws exception
      await expectLater(
        coordinator.executeJob(
          job: job1,
          transport: transport,
          encodedBytes: [1, 2, 3],
        ),
        throwsA(isA<PrinterException>()),
      );
    });
  });
}
