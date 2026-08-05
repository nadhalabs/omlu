import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type TransportType = 'windows_raw_spooler' | 'windows_driver_spooler' | 'tcp_lan' | 'bluetooth_com';

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
  tcpHost: '192.168.1.100',
  tcpPort: 9100,
  comPort: 'COM1',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  installationId: '',
  tenantId: '',
};

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
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return { ...defaultConfig, ...JSON.parse(raw) };
      }
    } catch {
      const backupPath = `${this.configPath}.bak`;
      if (fs.existsSync(backupPath)) {
        try {
          const raw = fs.readFileSync(backupPath, 'utf-8');
          return { ...defaultConfig, ...JSON.parse(raw) };
        } catch {
          // Fall through
        }
      }
    }
    return { ...defaultConfig };
  }
}
