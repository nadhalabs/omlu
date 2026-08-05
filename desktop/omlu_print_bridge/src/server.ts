import * as http from 'http';
import * as crypto from 'crypto';
import { ConfigManager, PrinterConfig } from './config';
import { validateOriginAndHost, verifySignedToken, sanitizeErrorMessage } from './security';
import { getBleCapability } from './capabilities/ble_capability';
import { PrintJobCoordinator } from './coordinator';
import { WindowsRawSpoolerTransport } from './transports/raw_spooler_transport';
import { WindowsDriverSpoolerTransport } from './transports/driver_spooler_transport';
import { TcpPrinterTransport } from './transports/tcp_transport';
import { SerialComPrinterTransport } from './transports/serial_com_transport';
import { PrinterTransport } from './transports/transport';

const PORT = 24242;
const HOST = '127.0.0.1';

export class PrintBridgeServer {
  private server: http.Server;
  private configManager: ConfigManager;
  private coordinator: PrintJobCoordinator;
  private activePairingCode: string | null = null;

  constructor(customConfigPath?: string) {
    this.configManager = new ConfigManager(customConfigPath);
    this.coordinator = new PrintJobCoordinator();
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  public getTransport(config: PrinterConfig): PrinterTransport {
    switch (config.transport) {
      case 'windows_raw_spooler':
        return new WindowsRawSpoolerTransport(config.queueName);
      case 'windows_driver_spooler':
        return new WindowsDriverSpoolerTransport(config.queueName);
      case 'tcp_lan':
        return new TcpPrinterTransport(
          config.tcpHost,
          config.tcpPort,
          config.connectTimeoutMs,
          config.writeTimeoutMs,
          config.chunkSize,
          config.interChunkDelayMs
        );
      case 'bluetooth_com':
        return new SerialComPrinterTransport(
          config.comPort,
          config.baudRate,
          config.chunkSize,
          config.interChunkDelayMs
        );
      default:
        return new WindowsRawSpoolerTransport(config.queueName);
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!validateOriginAndHost(req, res)) return;

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    try {
      if (method === 'GET' && path === '/v1/health') {
        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        const isOnline = await transport.testConnection();

        return this.json(res, 200, {
          bridge_version: '1.0.0',
          operating_system: process.platform,
          readiness: 'ready',
          configured_printer: config.printerName,
          active_transport: config.transport,
          supported_transports: ['windows_raw_spooler', 'windows_driver_spooler', 'tcp_lan', 'bluetooth_com'],
          active_job_id: this.coordinator.getActiveJobId(),
          printer_online: isOnline,
          installation_id: config.installationId || null,
          tenant_id: config.tenantId || null,
        });
      }

      if (method === 'GET' && path === '/v1/capabilities') {
        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        return this.json(res, 200, {
          transports: [
            transport.capabilities(),
            getBleCapability(),
          ],
        });
      }

      if (method === 'GET' && path === '/v1/printers') {
        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        const printers = await transport.listAvailable();
        return this.json(res, 200, { printers });
      }

      if (method === 'POST' && path === '/v1/printers/discover') {
        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        const discovered = await transport.discover();
        return this.json(res, 200, { printers: discovered });
      }

      if (method === 'POST' && path === '/v1/pairing/code') {
        this.activePairingCode = `${Math.floor(100000 + Math.random() * 900000)}`;
        return this.json(res, 200, { pairing_code: this.activePairingCode, expires_in_seconds: 300 });
      }

      if (method === 'POST' && path === '/v1/pairing/confirm') {
        const body = await this.readJson(req);
        if (!body.pairing_code || body.pairing_code !== this.activePairingCode) {
          return this.json(res, 400, { error: 'INVALID_PAIRING_CODE', message: 'Invalid or expired pairing code.' });
        }
        this.activePairingCode = null;
        this.configManager.saveConfig({
          installationId: body.installation_id || `inst_${crypto.randomBytes(8).toString('hex')}`,
          tenantId: body.tenant_id || 'unknown',
          pairedAt: new Date().toISOString(),
        });
        return this.json(res, 200, { status: 'paired', installation_id: this.configManager.getConfig().installationId });
      }

      if (method === 'GET' && path === '/v1/settings') {
        return this.json(res, 200, { settings: this.configManager.getConfig() });
      }

      if (method === 'POST' && path === '/v1/settings') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:configure');
        if (!sec.valid) {
          return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        }

        const body = await this.readJson(req);
        const updated = this.configManager.saveConfig(body);
        return this.json(res, 200, { status: 'success', settings: updated });
      }

      if (method === 'POST' && path === '/v1/printers/test') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:test');
        if (!sec.valid) {
          return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        }

        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        const testJob = {
          schema_version: '1.0' as const,
          job_id: `test_${Date.now()}`,
          idempotency_key: `test_idempotency_${Date.now()}`,
          installation_id: config.installationId || 'test_inst',
          tenant_id: config.tenantId || 'test_tenant',
          receipt_type: 'test' as const,
          copy_count: 1,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
          retry_count: 0,
          signed_token: token,
        };

        const result = await this.coordinator.executePrintJob(testJob, config, transport);
        return this.json(res, result.state === 'completed' ? 200 : 500, { result });
      }

      if (method === 'POST' && path === '/v1/print-jobs') {
        const body = await this.readJson(req);
        const action = body.receipt_type === 'receipt' && body.receipt_data?.status === 'paid' ? 'receipt:reprint' : 'bill:print';
        const sec = verifySignedToken(body.signed_token, action);
        if (!sec.valid) {
          return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        }

        const config = this.configManager.getConfig();
        const transport = this.getTransport(config);
        const result = await this.coordinator.executePrintJob(body, config, transport);
        return this.json(res, result.state === 'completed' ? 200 : 500, { result });
      }

      if (method === 'GET' && path.startsWith('/v1/print-jobs/')) {
        const jobId = path.replace('/v1/print-jobs/', '');
        const statusRecord = this.coordinator.getJobStatus(jobId);
        if (!statusRecord) {
          return this.json(res, 404, { error: 'JOB_NOT_FOUND', message: 'Print job ID not found.' });
        }
        return this.json(res, 200, { job: statusRecord });
      }

      return this.json(res, 404, { error: 'NOT_FOUND', message: 'Endpoint not found.' });
    } catch (err: any) {
      return this.json(res, 500, { error: 'INTERNAL_ERROR', message: sanitizeErrorMessage(err) });
    }
  }

  private readJson(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) { // 1MB Limit
          req.destroy();
          reject(new Error('REQUEST_TOO_LARGE'));
        }
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error('INVALID_JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  private json(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  public listen(port: number = PORT, host: string = HOST): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

if (require.main === module) {
  const server = new PrintBridgeServer();
  server.listen(PORT, HOST).then(() => {
    console.log(`OMLU Print Bridge Server listening on http://${HOST}:${PORT}`);
  });
}
