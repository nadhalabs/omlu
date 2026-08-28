import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type TransportType = 'windows_raw_spooler' | 'windows_driver_spooler' | 'macos_spooler' | 'tcp_lan' | 'bluetooth_com';

export interface PrinterProfile {
  id: string;
  name: string;
  purpose: 'billing' | 'kitchen';
  transport: TransportType;
  host?: string;
  port?: number;
  queueName?: string;
  paperWidth: '58' | '80';
  enabled: boolean;
  is_default: boolean;
  createdAt: string;
  updatedAt: string;
  lastSuccessfulTestAt?: string;
}

export interface PrinterConfig {
  enabled: boolean;
  transport: TransportType;
  printerName: string;
  queueName: string; // Windows printer queue
  paperWidth: '58' | '80';
  copies: number;
  autoCut: boolean;
  codePage: string;
  charsPerLine: number;
  connectTimeoutMs: number;
  writeTimeoutMs: number;
  chunkSize: number;
  interChunkDelayMs: number;
  feedLines: number;
  qrMode: 'native' | 'raster';
  // TCP settings
  tcpHost: string;
  tcpPort: number;
  // Serial COM settings
  comPort: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: 'none' | 'even' | 'odd';
  // Installation & pairing state
  installationId: string;
  tenantId: string;
  pairedAt?: string;
  backendUrl: string;
  backendPublicKeyPem: string;
  credentialSecret: string;
  kitchenPrinterEnabled: boolean;
  kitchenPrinterName: string;
  kitchenPrinterHost: string;
  kitchenPrinterPort: number;
  billingPrinterEnabled: boolean;
  billingPrinterName: string;
  billingPrinterHost: string;
  billingPrinterPort: number;
  // Multiple Printer Profiles
  printers: PrinterProfile[];
}

export const defaultConfig: PrinterConfig = {
  enabled: true,
  transport: 'windows_raw_spooler',
  printerName: 'Generic ESC/POS Thermal Printer',
  queueName: 'POS58',
  paperWidth: '58',
  copies: 1,
  autoCut: true,
  codePage: 'CP437',
  charsPerLine: 32,
  connectTimeoutMs: 5000,
  writeTimeoutMs: 5000,
  chunkSize: 128,
  interChunkDelayMs: 10,
  feedLines: 3,
  qrMode: 'raster',
  tcpHost: '192.168.1.100',
  tcpPort: 9100,
  comPort: 'COM1',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  installationId: '',
  tenantId: '',
  backendUrl: '',
  backendPublicKeyPem: '',
  credentialSecret: '',
  kitchenPrinterEnabled: false,
  kitchenPrinterName: 'Kitchen Printer',
  kitchenPrinterHost: '',
  kitchenPrinterPort: 9100,
  billingPrinterEnabled: false,
  billingPrinterName: 'Billing Printer',
  billingPrinterHost: '',
  billingPrinterPort: 9100,
  printers: [],
};

export function isPersistedPairingComplete(config: PrinterConfig): boolean {
  return Boolean(
    config.installationId &&
    config.tenantId &&
    config.pairedAt &&
    config.backendUrl &&
    config.backendPublicKeyPem &&
    config.credentialSecret
  );
}

export class ConfigManager {
  private configPath: string;
  private currentConfig: PrinterConfig;

  constructor(customPath?: string) {
    if (customPath) {
      this.configPath = customPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), '.omlu_print_bridge');
      const dir = path.join(appData, 'OMLUPrintBridge');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.configPath = path.join(dir, 'config.json');
    }
    this.currentConfig = this.load();
    if (!this.currentConfig.installationId) {
      this.saveConfig({ installationId: `inst_${require('crypto').randomBytes(12).toString('hex')}` });
    }
  }

  public getConfig(): PrinterConfig {
    return { ...this.currentConfig };
  }

  public saveConfig(newConfig: Partial<PrinterConfig>): PrinterConfig {
    this.currentConfig = { ...this.currentConfig, ...newConfig };
    const tempPath = `${this.configPath}.tmp`;
    const backupPath = `${this.configPath}.bak`;

    try {
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, backupPath);
      }
      fs.writeFileSync(tempPath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.configPath);
    } catch (err) {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, this.configPath);
      }
      throw err;
    }
    return this.getConfig();
  }

  public load(): PrinterConfig {
    let loaded: PrinterConfig = { ...defaultConfig };
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        loaded = { ...defaultConfig, ...JSON.parse(raw) };
      }
    } catch {
      const backupPath = `${this.configPath}.bak`;
      if (fs.existsSync(backupPath)) {
        try {
          const raw = fs.readFileSync(backupPath, 'utf-8');
          loaded = { ...defaultConfig, ...JSON.parse(raw) };
        } catch {
          // Fall through
        }
      }
    }

    // Idempotently migrate legacy config into printers array
    if (!Array.isArray(loaded.printers) || loaded.printers.length === 0) {
      const profiles: PrinterProfile[] = [];
      if (loaded.billingPrinterHost) {
        profiles.push({
          id: 'profile_billing_default',
          name: loaded.billingPrinterName || 'Default Billing Printer',
          purpose: 'billing',
          transport: 'tcp_lan',
          host: loaded.billingPrinterHost,
          port: loaded.billingPrinterPort || 9100,
          paperWidth: loaded.paperWidth || '80',
          enabled: loaded.billingPrinterEnabled !== false,
          is_default: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (loaded.kitchenPrinterHost) {
        profiles.push({
          id: 'profile_kitchen_default',
          name: loaded.kitchenPrinterName || 'Main Kitchen Printer',
          purpose: 'kitchen',
          transport: 'tcp_lan',
          host: loaded.kitchenPrinterHost,
          port: loaded.kitchenPrinterPort || 9100,
          paperWidth: '80',
          enabled: loaded.kitchenPrinterEnabled !== false,
          is_default: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      loaded.printers = profiles;
    }

    return loaded;
  }
}
