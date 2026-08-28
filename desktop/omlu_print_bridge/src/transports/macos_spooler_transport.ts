import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { DeviceInfo, PrinterTransport, TransportCapabilities } from './transport';

const execFileAsync = promisify(execFile);

export class MacOSSpoolerTransport implements PrinterTransport {
  public transportName = 'macos_spooler';
  private buffer: Buffer[] = [];
  private connected = false;

  constructor(private queueName: string) {}

  async discover(): Promise<DeviceInfo[]> { return this.listAvailable(); }

  async listAvailable(): Promise<DeviceInfo[]> {
    if (os.platform() !== 'darwin') return [];
    const { stdout } = await execFileAsync('/usr/bin/lpstat', ['-p'], { timeout: 3000 });
    return stdout.split(/\r?\n/).filter((line) => line.startsWith('printer ')).map((line) => {
      const name = line.slice(8).split(/\s+/)[0];
      return { id: `macos:${name}`, name, transport: this.transportName, queueName: name,
        description: 'Configured macOS printer', available: !line.includes('disabled'), connectionType: 'system' as const,
        confidence: 'confirmed' as const };
    });
  }

  async connect(): Promise<void> { this.connected = true; this.buffer = []; }
  async write(data: Buffer): Promise<void> {
    if (!this.connected) throw new Error('macOS printer queue is not connected.');
    this.buffer.push(data);
  }
  async flush(): Promise<void> {
    if (os.platform() !== 'darwin') throw new Error('MACOS_SPOOLER_ONLY_SUPPORTED_ON_DARWIN');
    const tempFile = path.join(os.tmpdir(), `omlu_macos_spool_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tempFile, Buffer.concat(this.buffer));
      this.buffer = [];
      await execFileAsync('/usr/bin/lp', ['-d', this.queueName, '-o', 'raw', tempFile], { timeout: 10000 });
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }
  async disconnect(): Promise<void> { this.connected = false; this.buffer = []; }
  async testConnection(): Promise<boolean> {
    try { return (await this.listAvailable()).some((item) => item.queueName === this.queueName && item.available); }
    catch { return false; }
  }
  capabilities(): TransportCapabilities {
    return { transport: this.transportName, available: os.platform() === 'darwin', rawModeSupported: true,
      driverModeSupported: true, maxChunkSize: 8192, reasonCode: os.platform() === 'darwin' ? undefined : 'MACOS_ONLY' };
  }
}
