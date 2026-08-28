export interface DeviceInfo {
  id: string;
  name: string;
  transport: string;
  description?: string;
  available: boolean;
  connectionType?: 'usb' | 'network' | 'bluetooth' | 'system' | 'unknown';
  confidence?: 'confirmed' | 'possible';
  queueName?: string;
  host?: string;
  port?: number;
  isDefault?: boolean;
}

export interface TransportCapabilities {
  transport: string;
  available: boolean;
  rawModeSupported: boolean;
  driverModeSupported: boolean;
  maxChunkSize: number;
  reasonCode?: string;
}

export interface PrinterTransport {
  transportName: string;
  discover(): Promise<DeviceInfo[]>;
  listAvailable(): Promise<DeviceInfo[]>;
  connect(): Promise<void>;
  write(data: Buffer): Promise<void>;
  flush(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  capabilities(): TransportCapabilities;
}
