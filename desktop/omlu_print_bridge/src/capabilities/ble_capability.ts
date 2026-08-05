export interface BleCapabilityReport {
  transport: 'bluetoothLowEnergy';
  supported: false;
  reasonCode: 'WINDOWS_BLE_NOT_SUPPORTED_IN_THIS_RELEASE';
  message: string;
}

export function getBleCapability(): BleCapabilityReport {
  return {
    transport: 'bluetoothLowEnergy',
    supported: false,
    reasonCode: 'WINDOWS_BLE_NOT_SUPPORTED_IN_THIS_RELEASE',
    message: 'Windows BLE printing is deferred in this release. Use Bluetooth Classic serial COM ports or TCP/LAN printers.',
  };
}
