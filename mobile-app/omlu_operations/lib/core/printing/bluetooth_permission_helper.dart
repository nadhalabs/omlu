import 'package:permission_handler/permission_handler.dart';
import 'bluetooth_platform.dart';
import 'printer_adapter.dart';

class BluetoothPermissionHelper {
  BluetoothPermissionHelper({OmluBluetoothPlatform? platform})
    : _platform = platform ?? MethodChannelBluetoothPlatform();

  final OmluBluetoothPlatform _platform;

  Future<void> ensureConnectPermissions() async {
    final state = await _platform.checkState();
    if (!state.supported) {
      throw const PrinterException('Bluetooth is not supported on this device.');
    }
    if (!state.enabled) {
      throw const PrinterException('Bluetooth is turned off on this device.');
    }

    final connectStatus = await Permission.bluetoothConnect.status;
    if (connectStatus.isPermanentlyDenied) {
      throw const PrinterException(
        'Bluetooth permission is required. Please enable it in Android Settings.',
      );
    }
    if (connectStatus.isDenied) {
      final req = await Permission.bluetoothConnect.request();
      if (!req.isGranted) {
        throw const PrinterException('Bluetooth permission was denied.');
      }
    }
  }

  Future<void> ensureScanPermissions() async {
    await ensureConnectPermissions();

    final scanStatus = await Permission.bluetoothScan.status;
    if (scanStatus.isPermanentlyDenied) {
      throw const PrinterException(
        'Bluetooth scan permission is required. Please enable it in Android Settings.',
      );
    }
    if (scanStatus.isDenied) {
      final req = await Permission.bluetoothScan.request();
      if (!req.isGranted) {
        // Fallback check for location permission on older Android
        final locStatus = await Permission.location.request();
        if (!locStatus.isGranted) {
          throw const PrinterException('Bluetooth scan permission was denied.');
        }
      }
    }
  }
}
