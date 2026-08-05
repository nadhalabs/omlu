import { PrinterTransport, DeviceInfo, TransportCapabilities } from './transport';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WindowsDriverSpoolerTransport implements PrinterTransport {
  public transportName = 'windows_driver_spooler';
  private queueName: string;
  private isConnected: boolean = false;
  private buffer: Buffer[] = [];

  constructor(queueName: string = 'POS58') {
    this.queueName = queueName;
  }

  public async discover(): Promise<DeviceInfo[]> {
    return this.listAvailable();
  }

  public async listAvailable(): Promise<DeviceInfo[]> {
    if (os.platform() !== 'win32') {
      return [{
        id: this.queueName,
        name: `${this.queueName} (Driver Fallback)`,
        transport: this.transportName,
        description: 'Simulated Windows Driver Queue',
        available: true,
      }];
    }

    try {
      const { stdout } = await execAsync('powershell -Command "Get-Printer | Select-Name,DriverName | ConvertTo-Json"');
      const parsed = JSON.parse(stdout);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items.map((p: any) => ({
        id: p.Name,
        name: p.Name,
        transport: this.transportName,
        description: `Driver: ${p.DriverName || 'System Driver'}`,
        available: true,
      }));
    } catch {
      return [{
        id: this.queueName,
        name: this.queueName,
        transport: this.transportName,
        description: 'Windows Driver Queue',
        available: true,
      }];
    }
  }

  public async connect(): Promise<void> {
    this.isConnected = true;
    this.buffer = [];
  }

  public async write(data: Buffer): Promise<void> {
    if (!this.isConnected) throw new Error('Driver spooler transport not connected.');
    this.buffer.push(data);
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const combined = Buffer.concat(this.buffer);
    this.buffer = [];

    if (os.platform() !== 'win32') {
      const tempText = path.join(os.tmpdir(), `omlu_driver_print_${Date.now()}.txt`);
      fs.writeFileSync(tempText, combined.toString('utf-8'));
      return;
    }

    const tempFile = path.join(os.tmpdir(), `omlu_driver_spool_${Date.now()}.txt`);
    try {
      fs.writeFileSync(tempFile, combined.toString('utf-8'));
      await execAsync(`powershell -Command "Get-Content '${tempFile}' | Out-Printer -Name '${this.queueName}'"`);
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.buffer = [];
  }

  public async testConnection(): Promise<boolean> {
    const list = await this.listAvailable();
    return list.some(p => p.id === this.queueName);
  }

  public capabilities(): TransportCapabilities {
    return {
      transport: this.transportName,
      available: true,
      rawModeSupported: false,
      driverModeSupported: true,
      maxChunkSize: 8192,
    };
  }
}
