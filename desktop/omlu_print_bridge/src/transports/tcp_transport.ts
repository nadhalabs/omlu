import { PrinterTransport, DeviceInfo, TransportCapabilities } from './transport';
import * as net from 'net';

export class TcpPrinterTransport implements PrinterTransport {
  public transportName = 'tcp_lan';
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private connectTimeoutMs: number;
  private writeTimeoutMs: number;
  private chunkSize: number;
  private interChunkDelayMs: number;

  constructor(
    host: string = '192.168.1.100',
    port: number = 9100,
    connectTimeoutMs: number = 5000,
    writeTimeoutMs: number = 5000,
    chunkSize: number = 256,
    interChunkDelayMs: number = 10
  ) {
    this.host = host;
    this.port = port;
    this.connectTimeoutMs = connectTimeoutMs;
    this.writeTimeoutMs = writeTimeoutMs;
    this.chunkSize = chunkSize;
    this.interChunkDelayMs = interChunkDelayMs;
  }

  public async discover(): Promise<DeviceInfo[]> {
    return this.listAvailable();
  }

  public async listAvailable(): Promise<DeviceInfo[]> {
    return [{
      id: `${this.host}:${this.port}`,
      name: `TCP Printer (${this.host}:${this.port})`,
      transport: this.transportName,
      description: 'ESC/POS Network Printer (Port 9100)',
      available: true,
    }];
  }

  public async connect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    return new Promise<void>((resolve, reject) => {
      let isSettled = false;
      const socket = new net.Socket();

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          socket.destroy();
          reject(new Error(`TCP connection to ${this.host}:${this.port} timed out after ${this.connectTimeoutMs}ms.`));
        }
      }, this.connectTimeoutMs);

      socket.connect(this.port, this.host, () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          this.socket = socket;
          resolve();
        }
      });

      socket.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(`TCP connection failed: ${err.message}`));
        }
      });
    });
  }

  public async write(data: Buffer): Promise<void> {
    if (!this.socket) throw new Error('TCP socket not connected.');

    for (let offset = 0; offset < data.length; offset += this.chunkSize) {
      const chunk = data.subarray(offset, offset + this.chunkSize);
      await this.writeChunk(chunk);
      if (this.interChunkDelayMs > 0 && offset + this.chunkSize < data.length) {
        await new Promise(r => setTimeout(r, this.interChunkDelayMs));
      }
    }
  }

  private writeChunk(chunk: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket disconnected.'));

      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.socket?.destroy();
          this.socket = null;
          reject(new Error('TCP chunk write timed out.'));
        }
      }, this.writeTimeoutMs);

      this.socket.write(chunk, (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (err) {
            this.socket?.destroy();
            this.socket = null;
            reject(err);
          } else {
            resolve();
          }
        }
      });
    });
  }

  public async flush(): Promise<void> {
    // Sockets flush automatically on completion of write stream
  }

  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch {
      return false;
    }
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
