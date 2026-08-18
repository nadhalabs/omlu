import { PrinterTransport } from './transports/transport';
import { PrintJobPayload, validatePrintJob, DesktopEscPosEncoder } from './contract';
import { PrinterConfig } from './config';
import { sanitizeErrorMessage } from './security';

export type JobState = 'received' | 'validated' | 'queued' | 'connecting' | 'printing' | 'flushing' | 'completed' | 'failed' | 'rejected';

export interface JobRecord {
  jobId: string;
  state: JobState;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export class PrintJobCoordinator {
  private activeJobId: string | null = null;
  private completedJobs: Map<string, JobRecord> = new Map();
  private lock: Promise<void> = Promise.resolve();

  public getActiveJobId(): string | null {
    return this.activeJobId;
  }

  public getJobStatus(jobId: string): JobRecord | undefined {
    return this.completedJobs.get(jobId);
  }

  public async executePrintJob(
    job: PrintJobPayload,
    config: PrinterConfig,
    transport: PrinterTransport
  ): Promise<JobRecord> {
    // 1. Validation
    const val = validatePrintJob(job);
    if (!val.valid) {
      const record: JobRecord = {
        jobId: job.job_id || 'unknown',
        state: 'rejected',
        createdAt: new Date().toISOString(),
        error: val.reason,
      };
      if (job.job_id) this.completedJobs.set(job.job_id, record);
      return record;
    }

    // 2. Duplicate Job Check
    if (this.completedJobs.has(job.job_id)) {
      const existing = this.completedJobs.get(job.job_id)!;
      if (existing.state === 'completed') {
        return existing;
      }
    }

    // 3. Queue & Single-flight Mutex Lock
    let releaseLock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => { releaseLock = resolve; });
    const currentLock = this.lock;
    this.lock = nextLock;

    await currentLock;

    this.activeJobId = job.job_id;
    const record: JobRecord = {
      jobId: job.job_id,
      state: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.completedJobs.set(job.job_id, record);

    try {
      // 4. Encode Payload
      const encoder = new DesktopEscPosEncoder(config.paperWidth, config.autoCut, config.feedLines, config.qrMode || 'raster');
      let payloadBuffer: Buffer;

      if (job.receipt_type === 'test') {
        payloadBuffer = encoder.encodeTestPage();
      } else if (job.receipt_type === 'kitchen' && job.kitchen_data) {
        payloadBuffer = encoder.encodeKitchenTicket(job.kitchen_data);
      } else if (job.receipt_data) {
        payloadBuffer = encoder.encodeReceipt(job.receipt_data);
      } else {
        throw new Error('MISSING_RECEIPT_CONTENT');
      }

      // 5. Connect
      record.state = 'connecting';
      await transport.connect();

      // 6. Print & Copy Count Loop
      record.state = 'printing';
      const copies = Math.max(1, Math.min(job.copy_count || config.copies || 1, 5));
      for (let c = 0; c < copies; c++) {
        await transport.write(payloadBuffer);
      }

      // 7. Flush
      record.state = 'flushing';
      await transport.flush();

      record.state = 'completed';
      record.completedAt = new Date().toISOString();
      return record;
    } catch (err: any) {
      record.state = 'failed';
      record.error = sanitizeErrorMessage(err);
      return record;
    } finally {
      // Resource Cleanup in finally
      try {
        await transport.disconnect();
      } catch {}
      this.activeJobId = null;
      releaseLock();
    }
  }
}
