import { ConfigManager, PrinterConfig } from './config';
import { PrintJobCoordinator } from './coordinator';
import { TcpPrinterTransport } from './transports/tcp_transport';
import { KitchenTicketPayload, PrintJobPayload } from './contract';

export class KitchenPrintConsumer {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private configManager: ConfigManager, private coordinator: PrintJobCoordinator) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 5000);
    void this.tick();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private headers(config: PrinterConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Bridge-Installation': config.installationId,
      'X-Bridge-Credential': config.credentialSecret,
    };
  }

  private ready(config: PrinterConfig): boolean {
    return Boolean(config.backendUrl && config.credentialSecret && config.tenantId &&
      config.kitchenPrinterEnabled && config.kitchenPrinterHost && config.kitchenPrinterPort);
  }

  private async request(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  }

  public async tick(): Promise<void> {
    if (this.busy) return;
    const config = this.configManager.getConfig();
    if (!this.ready(config)) return;
    this.busy = true;
    const base = config.backendUrl.replace(/\/$/, '');
    try {
      await this.request(`${base}/api/admin/print-bridge/consumer/heartbeat`, {
        method: 'POST', headers: this.headers(config),
        body: JSON.stringify({ kitchen_printer_configured: true, kitchen_printer_label: config.kitchenPrinterName }),
      });
      const claimResponse = await this.request(`${base}/api/admin/print-bridge/consumer/claim`, {
        method: 'POST', headers: this.headers(config), body: '{}',
      });
      if (!claimResponse.ok) return;
      const claimed = await claimResponse.json() as { job: null | { id: number; retry_count: number; payload: KitchenTicketPayload } };
      if (!claimed.job) return;
      const transport = new TcpPrinterTransport(
        config.kitchenPrinterHost, config.kitchenPrinterPort,
        Math.min(config.connectTimeoutMs, 5000), Math.min(config.writeTimeoutMs, 5000),
        config.chunkSize, config.interChunkDelayMs,
      );
      const printJob: PrintJobPayload = {
        schema_version: '1.0', job_id: `kitchen_${claimed.job.id}`,
        idempotency_key: `kitchen_job:${claimed.job.id}`, installation_id: config.installationId,
        tenant_id: config.tenantId, receipt_type: 'kitchen', kitchen_data: claimed.job.payload,
        copy_count: 1, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(), retry_count: claimed.job.retry_count,
        signed_token: '',
      };
      const result = await this.coordinator.executePrintJob(printJob, config, transport);
      await this.request(`${base}/api/admin/print-bridge/consumer/jobs/${claimed.job.id}/result`, {
        method: 'POST', headers: this.headers(config),
        body: JSON.stringify({ status: result.state === 'completed' ? 'printed' : 'failed', failure_message: result.error || null }),
      });
    } catch {
      // Offline backend/printer is expected operational failure. The next bounded tick retries safely.
    } finally {
      this.busy = false;
    }
  }
}
