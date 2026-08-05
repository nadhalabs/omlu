import { PrinterTransport, DeviceInfo, TransportCapabilities } from './transport';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SerialComPrinterTransport implements PrinterTransport {
  public transportName = 'bluetooth_com';
  private comPort: string;
  private baudRate: number;
  private chunkSize: number;
  private interChunkDelayMs: number;
  private isConnected: boolean = false;
  private buffer: Buffer[] = [];

  constructor(
    comPort: string = 'COM1',
    baudRate: number = 9600,
    chunkSize: number = 64,
    interChunkDelayMs: number = 20
  ) {
    this.comPort = comPort;
    this.baudRate = baudRate;
    this.chunkSize = chunkSize;
    this.interChunkDelayMs = interChunkDelayMs;
  }

  public async discover(): Promise<DeviceInfo[]> {
    return this.listAvailable();
  }

  public async listAvailable(): Promise<DeviceInfo[]> {
    if (os.platform() !== 'win32') {
      return [{
        id: this.comPort,
        name: `${this.comPort} (Bluetooth Serial Port)`,
        transport: this.transportName,
        description: 'Simulated Windows COM Port',
        available: true,
      }];
    }

    try {
      const { stdout } = await execAsync('powershell -Command "[System.IO.Ports.SerialPort]::GetPortNames() | ConvertTo-Json"');
      const parsed = JSON.parse(stdout);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items.map((portName: string) => ({
        id: portName,
        name: `Bluetooth Printer (${portName})`,
        transport: this.transportName,
        description: `Paired Windows Serial COM Port (${portName})`,
        available: true,
      }));
    } catch {
      return [{
        id: this.comPort,
        name: this.comPort,
        transport: this.transportName,
        description: 'Serial COM Port',
        available: true,
      }];
    }
  }

  public async connect(): Promise<void> {
    this.isConnected = true;
    this.buffer = [];
  }

  public async write(data: Buffer): Promise<void> {
    if (!this.isConnected) throw new Error('Serial COM transport not connected.');
    this.buffer.push(data);
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const combined = Buffer.concat(this.buffer);
    this.buffer = [];

    if (os.platform() !== 'win32') {
      throw new Error('WINDOWS_SERIAL_COM_ONLY_SUPPORTED_ON_WIN32: Windows serial COM ports are only supported on Windows operating systems.');
    }

    // Direct Windows PowerShell SerialPort stream write with chunking & write delay
    const tempBin = path.join(os.tmpdir(), `omlu_com_spool_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tempBin, combined);
      const script = `
        $port = New-Object System.IO.Ports.SerialPort '${this.comPort}', ${this.baudRate}, None, 8, One
        $port.Open()
        $bytes = [System.IO.File]::ReadAllBytes('${tempBin.replace(/\\/g, '\\\\')}')
        $chunkSize = ${this.chunkSize}
        for ($i = 0; $i -lt $bytes.Length; $i += $chunkSize) {
          $length = [Math]::Min($chunkSize, $bytes.Length - $i)
          $port.Write($bytes, $i, $length)
          Start-Sleep -Milliseconds ${this.interChunkDelayMs}
        }
        $port.Close()
      `;
      await execAsync(`powershell -Command "${script.replace(/\n/g, ' ')}"`);
    } finally {
      if (fs.existsSync(tempBin)) {
        try { fs.unlinkSync(tempBin); } catch {}
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.buffer = [];
  }

  public async testConnection(): Promise<boolean> {
    const list = await this.listAvailable();
    return list.some(p => p.id === this.comPort);
  }

  public capabilities(): TransportCapabilities {
    return {
      transport: this.transportName,
      available: true,
      rawModeSupported: true,
      driverModeSupported: false,
      maxChunkSize: this.chunkSize,
    };
  }
}
