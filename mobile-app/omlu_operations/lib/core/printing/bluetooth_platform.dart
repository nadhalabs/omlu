import 'dart:async';
import 'package:flutter/services.dart';

enum BluetoothCapability { classic, ble }

class DiscoveredPrinterDevice {
  const DiscoveredPrinterDevice({
    required this.name,
    required this.address,
    this.isBonded = false,
    this.capabilities = const {BluetoothCapability.classic},
  });

  final String name;
  final String address;
  final bool isBonded;
  final Set<BluetoothCapability> capabilities;

  Map<String, dynamic> toJson() => {
    'name': name,
    'address': address,
    'is_bonded': isBonded,
    'capabilities': capabilities.map((e) => e.name).toList(),
  };

  factory DiscoveredPrinterDevice.fromJson(Map<String, dynamic> json) {
    final rawCaps = (json['capabilities'] as List?)?.cast<String>() ?? [];
    final caps = <BluetoothCapability>{};
    if (rawCaps.contains('classic')) caps.add(BluetoothCapability.classic);
    if (rawCaps.contains('ble')) caps.add(BluetoothCapability.ble);
    if (caps.isEmpty) caps.add(BluetoothCapability.classic);

    return DiscoveredPrinterDevice(
      name: json['name'] as String? ?? 'Unknown Printer',
      address: json['address'] as String? ?? '',
      isBonded: json['is_bonded'] == true,
      capabilities: caps,
    );
  }
}

class DiscoveredGattService {
  const DiscoveredGattService({
    required this.uuid,
    required this.characteristics,
  });

  final String uuid;
  final List<DiscoveredGattCharacteristic> characteristics;
}

class DiscoveredGattCharacteristic {
  const DiscoveredGattCharacteristic({
    required this.uuid,
    required this.canWriteWithResponse,
    required this.canWriteWithoutResponse,
  });

  final String uuid;
  final bool canWriteWithResponse;
  final bool canWriteWithoutResponse;
}

class BluetoothState {
  const BluetoothState({
    required this.supported,
    required this.enabled,
    required this.hasConnectPermission,
    required this.hasScanPermission,
  });

  final bool supported;
  final bool enabled;
  final bool hasConnectPermission;
  final bool hasScanPermission;
}

abstract class OmluBluetoothPlatform {
  Future<BluetoothState> checkState();
  Future<List<DiscoveredPrinterDevice>> getPairedDevices();
  Stream<DiscoveredPrinterDevice> startScan();
  Future<void> stopScan();
  Future<bool> connectClassic({
    required String address,
    String? uuid,
    bool allowInsecure = false,
  });
  Future<void> writeClassic({
    required List<int> bytes,
    int chunkSize = 128,
    int delayMs = 20,
  });
  Future<void> flushClassic();
  Future<void> disconnectClassic();

  Future<List<DiscoveredGattService>> connectBle({
    required String address,
    int timeoutMs = 5000,
  });
  Future<void> writeBle({
    String? serviceUuid,
    String? characteristicUuid,
    required List<int> bytes,
    String writeMode = 'auto',
    int chunkSize = 20,
    int delayMs = 20,
  });
  Future<void> disconnectBle();
}

class MethodChannelBluetoothPlatform implements OmluBluetoothPlatform {
  static const _commandChannel = MethodChannel(
    'app.omlu.operations/bluetooth/commands',
  );
  static const _eventChannel = EventChannel(
    'app.omlu.operations/bluetooth/events',
  );

  @override
  Future<BluetoothState> checkState() async {
    try {
      final res = await _commandChannel.invokeMapMethod<String, dynamic>(
        'checkState',
      );
      return BluetoothState(
        supported: res?['supported'] == true,
        enabled: res?['enabled'] == true,
        hasConnectPermission: res?['has_connect_permission'] == true,
        hasScanPermission: res?['has_scan_permission'] == true,
      );
    } catch (_) {
      return const BluetoothState(
        supported: false,
        enabled: false,
        hasConnectPermission: false,
        hasScanPermission: false,
      );
    }
  }

  @override
  Future<List<DiscoveredPrinterDevice>> getPairedDevices() async {
    try {
      final list = await _commandChannel.invokeListMethod<Map>(
        'getPairedDevices',
      );
      if (list == null) return [];
      return list
          .map(
            (item) => DiscoveredPrinterDevice.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .toList();
    } on PlatformException catch (e) {
      throw Exception(e.message ?? 'Failed to list paired Bluetooth devices.');
    }
  }

  @override
  Stream<DiscoveredPrinterDevice> startScan() {
    final controller = StreamController<DiscoveredPrinterDevice>();
    _commandChannel.invokeMethod('startScan').then((_) {
      _eventChannel.receiveBroadcastStream().listen(
        (dynamic event) {
          if (event is Map) {
            final type = event['event'] as String?;
            final data = event['data'] as Map?;
            if (type == 'device_found' && data != null) {
              controller.add(
                DiscoveredPrinterDevice.fromJson(
                  Map<String, dynamic>.from(data),
                ),
              );
            } else if (type == 'scan_completed') {
              controller.close();
            }
          }
        },
        onError: (Object error) {
          controller.addError(error);
          controller.close();
        },
        onDone: () {
          if (!controller.isClosed) controller.close();
        },
      );
    }).catchError((Object error) {
      controller.addError(error);
      controller.close();
    });

    return controller.stream;
  }

  @override
  Future<void> stopScan() async {
    try {
      await _commandChannel.invokeMethod('stopScan');
    } catch (_) {}
  }

  @override
  Future<bool> connectClassic({
    required String address,
    String? uuid,
    bool allowInsecure = false,
  }) async {
    try {
      final res = await _commandChannel.invokeMethod<bool>('connectClassic', {
        'address': address,
        'uuid': uuid,
        'allow_insecure': allowInsecure,
      });
      return res == true;
    } on PlatformException catch (e) {
      throw Exception(e.message ?? 'Printer connection failed.');
    }
  }

  @override
  Future<void> writeClassic({
    required List<int> bytes,
    int chunkSize = 128,
    int delayMs = 20,
  }) async {
    try {
      await _commandChannel.invokeMethod('writeClassic', {
        'bytes': Uint8List.fromList(bytes),
        'chunk_size': chunkSize,
        'delay_ms': delayMs,
      });
    } on PlatformException catch (e) {
      throw Exception(e.message ?? 'Printer write failed.');
    }
  }

  @override
  Future<void> flushClassic() async {
    try {
      await _commandChannel.invokeMethod('flushClassic');
    } catch (_) {}
  }

  @override
  Future<void> disconnectClassic() async {
    try {
      await _commandChannel.invokeMethod('disconnectClassic');
    } catch (_) {}
  }

  @override
  Future<List<DiscoveredGattService>> connectBle({
    required String address,
    int timeoutMs = 5000,
  }) async {
    try {
      final res = await _commandChannel.invokeListMethod<Map>('connectBle', {
        'address': address,
        'timeout_ms': timeoutMs,
      });
      if (res == null) return [];
      return res.map((s) {
        final chars = (s['characteristics'] as List? ?? []).map((c) {
          final cm = Map<String, dynamic>.from(c as Map);
          return DiscoveredGattCharacteristic(
            uuid: cm['uuid'] as String? ?? '',
            canWriteWithResponse: cm['can_write_with_response'] == true,
            canWriteWithoutResponse: cm['can_write_without_response'] == true,
          );
        }).toList();
        return DiscoveredGattService(
          uuid: s['uuid'] as String? ?? '',
          characteristics: chars,
        );
      }).toList();
    } on PlatformException catch (e) {
      throw Exception(e.message ?? 'BLE GATT connection failed.');
    }
  }

  @override
  Future<void> writeBle({
    String? serviceUuid,
    String? characteristicUuid,
    required List<int> bytes,
    String writeMode = 'auto',
    int chunkSize = 20,
    int delayMs = 20,
  }) async {
    try {
      await _commandChannel.invokeMethod('writeBle', {
        'service_uuid': serviceUuid,
        'characteristic_uuid': characteristicUuid,
        'bytes': Uint8List.fromList(bytes),
        'write_mode': writeMode,
        'chunk_size': chunkSize,
        'delay_ms': delayMs,
      });
    } on PlatformException catch (e) {
      throw Exception(e.message ?? 'BLE write failed.');
    }
  }

  @override
  Future<void> disconnectBle() async {
    try {
      await _commandChannel.invokeMethod('disconnectBle');
    } catch (_) {}
  }
}

class MockBluetoothPlatform implements OmluBluetoothPlatform {
  MockBluetoothPlatform({
    this.state = const BluetoothState(
      supported: true,
      enabled: true,
      hasConnectPermission: true,
      hasScanPermission: true,
    ),
    List<DiscoveredPrinterDevice>? pairedDevices,
    List<DiscoveredPrinterDevice>? scanDevices,
    this.shouldFailConnect = false,
    this.shouldFailWrite = false,
  }) : pairedDevicesList = pairedDevices ??
           [
             const DiscoveredPrinterDevice(
               name: 'Thermal Printer Classic',
               address: '00:11:22:33:44:55',
               isBonded: true,
               capabilities: {BluetoothCapability.classic},
             ),
             const DiscoveredPrinterDevice(
               name: 'Thermal Printer BLE',
               address: '66:77:88:99:AA:BB',
               isBonded: true,
               capabilities: {BluetoothCapability.ble},
             ),
           ],
       scanDevicesList = scanDevices ?? [];

  BluetoothState state;
  final List<DiscoveredPrinterDevice> pairedDevicesList;
  final List<DiscoveredPrinterDevice> scanDevicesList;
  final bool shouldFailConnect;
  final bool shouldFailWrite;

  bool isClassicConnected = false;
  bool isBleConnected = false;
  final writtenBytes = <int>[];

  @override
  Future<BluetoothState> checkState() async => state;

  @override
  Future<List<DiscoveredPrinterDevice>> getPairedDevices() async {
    if (!state.hasConnectPermission) {
      throw Exception('Bluetooth permission was denied.');
    }
    if (!state.enabled) {
      throw Exception('Bluetooth is turned off on this device.');
    }
    return pairedDevicesList;
  }

  @override
  Stream<DiscoveredPrinterDevice> startScan() {
    if (!state.hasScanPermission) {
      return Stream.error(Exception('Bluetooth scan permission was denied.'));
    }
    return Stream.fromIterable(scanDevicesList);
  }

  @override
  Future<void> stopScan() async {}

  @override
  Future<bool> connectClassic({
    required String address,
    String? uuid,
    bool allowInsecure = false,
  }) async {
    if (shouldFailConnect) {
      throw Exception('Printer is not connected.');
    }
    isClassicConnected = true;
    return true;
  }

  @override
  Future<void> writeClassic({
    required List<int> bytes,
    int chunkSize = 128,
    int delayMs = 20,
  }) async {
    if (shouldFailWrite || !isClassicConnected) {
      throw Exception('Printing failed. The bill remains safely issued.');
    }
    writtenBytes.addAll(bytes);
  }

  @override
  Future<void> flushClassic() async {}

  @override
  Future<void> disconnectClassic() async {
    isClassicConnected = false;
  }

  @override
  Future<List<DiscoveredGattService>> connectBle({
    required String address,
    int timeoutMs = 5000,
  }) async {
    if (shouldFailConnect) {
      throw Exception('Printer is not connected.');
    }
    isBleConnected = true;
    return [
      const DiscoveredGattService(
        uuid: '000018f0-0000-1000-8000-00805f9b34fb',
        characteristics: [
          DiscoveredGattCharacteristic(
            uuid: '00002af1-0000-1000-8000-00805f9b34fb',
            canWriteWithResponse: true,
            canWriteWithoutResponse: true,
          ),
        ],
      ),
    ];
  }

  @override
  Future<void> writeBle({
    String? serviceUuid,
    String? characteristicUuid,
    required List<int> bytes,
    String writeMode = 'auto',
    int chunkSize = 20,
    int delayMs = 20,
  }) async {
    if (shouldFailWrite || !isBleConnected) {
      throw Exception('Printing failed. The bill remains safely issued.');
    }
    writtenBytes.addAll(bytes);
  }

  @override
  Future<void> disconnectBle() async {
    isBleConnected = false;
  }
}
