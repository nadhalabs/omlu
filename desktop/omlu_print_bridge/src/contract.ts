export interface ReceiptItemPayload {
  name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  options?: string[];
  selected_options?: Array<{ group_name: string; option_name: string; price_adjustment: string }>;
}

export interface AuthoritativeReceiptPayload {
  bill_number: string;
  invoice_number?: string;
  table_number: string;
  restaurant_name: string;
  legal_business_name?: string;
  registered_billing_address?: string;
  gstin?: string;
  requested_at: string;
  issued_at?: string;
  paid_at?: string;
  status: 'draft' | 'issued' | 'payment_pending' | 'paid';
  items: ReceiptItemPayload[];
  subtotal: string;
  tax_amount: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  total_amount: string;
  payment_method?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface PrintJobPayload {
  schema_version: '1.0';
  job_id: string;
  idempotency_key: string;
  installation_id: string;
  tenant_id: string;
  bill_id?: string;
  bill_number?: string;
  receipt_type: 'bill' | 'receipt' | 'test';
  receipt_data?: AuthoritativeReceiptPayload;
  copy_count: number;
  created_at: string;
  expires_at: string;
  retry_count: number;
  signed_token: string;
}

export function validatePrintJob(job: any): { valid: boolean; reason?: string } {
  if (!job || typeof job !== 'object') return { valid: false, reason: 'INVALID_JOB_OBJECT' };
  if (job.schema_version !== '1.0') return { valid: false, reason: 'UNSUPPORTED_SCHEMA_VERSION' };
  if (!job.job_id) return { valid: false, reason: 'MISSING_JOB_ID' };
  if (!job.installation_id) return { valid: false, reason: 'MISSING_INSTALLATION_ID' };
  if (!job.tenant_id) return { valid: false, reason: 'MISSING_TENANT_ID' };
  if (!job.signed_token) return { valid: false, reason: 'MISSING_SIGNED_TOKEN' };

  if (job.receipt_type !== 'test') {
    if (!job.bill_id && !job.bill_number) return { valid: false, reason: 'MISSING_BILL_IDENTIFIER' };
    if (!job.receipt_data) return { valid: false, reason: 'MISSING_RECEIPT_DATA' };
    if (job.receipt_data.status === 'draft') return { valid: false, reason: 'DRAFT_RECEIPT_PRINT_REJECTED' };
  }
  return { valid: true };
}

export class DesktopEscPosEncoder {
  private width: number;
  private autoCut: boolean;
  private feedLines: number;

  constructor(width: '58' | '80' = '58', autoCut: boolean = true, feedLines: number = 3) {
    this.width = width === '80' ? 48 : 32;
    this.autoCut = autoCut;
    this.feedLines = feedLines;
  }

  public encodeTestPage(): Buffer {
    const bytes: number[] = [];

    // Init (ESC @)
    bytes.push(0x1B, 0x40);
    // Align Center (ESC a 1)
    bytes.push(0x1B, 0x61, 0x01);

    this.addString(bytes, '================================\n');
    this.addString(bytes, 'OMLU PRINT BRIDGE TEST PAGE\n');
    this.addString(bytes, '================================\n');

    // Align Left (ESC a 0)
    bytes.push(0x1B, 0x61, 0x00);
    this.addString(bytes, `Paper Width: ${this.width === 48 ? '80 mm (48 cols)' : '58 mm (32 cols)'}\n`);
    this.addString(bytes, `Timestamp: ${new Date().toLocaleString()}\n`);
    this.addString(bytes, 'Status: SUCCESSFUL TEST PRINT\n');
    this.addString(bytes, '--------------------------------\n');
    this.addString(bytes, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\n');
    this.addString(bytes, '0123456789 - ₹ INR Currency\n');
    this.addString(bytes, '--------------------------------\n\n');

    // Feed lines
    bytes.push(0x1B, 0x64, this.feedLines);

    // Cut command if enabled
    if (this.autoCut) {
      bytes.push(0x1D, 0x56, 0x41, 0x00);
    }

    return Buffer.from(bytes);
  }

  public encodeReceipt(data: AuthoritativeReceiptPayload): Buffer {
    const bytes: number[] = [];
    const w = this.width;

    // Init (ESC @)
    bytes.push(0x1B, 0x40);

    // Header - Center Aligned
    bytes.push(0x1B, 0x61, 0x01);
    this.addString(bytes, `${data.restaurant_name.toUpperCase()}\n`);
    if (data.legal_business_name) {
      this.addString(bytes, `${data.legal_business_name}\n`);
    }
    if (data.registered_billing_address) {
      this.addString(bytes, `${data.registered_billing_address}\n`);
    }
    if (data.gstin) {
      this.addString(bytes, `GSTIN: ${data.gstin}\n`);
    }

    this.addString(bytes, this.divider('-', w) + '\n');
    const title = data.status === 'paid' ? '*** PAYMENT RECEIPT ***' : '*** TAX INVOICE ***';
    this.addString(bytes, `${title}\n`);
    this.addString(bytes, this.divider('-', w) + '\n');

    // Left Aligned Meta
    bytes.push(0x1B, 0x61, 0x00);
    this.addString(bytes, `Bill #: ${data.bill_number}\n`);
    if (data.invoice_number) {
      this.addString(bytes, `Inv #: ${data.invoice_number}\n`);
    }
    this.addString(bytes, `Table #: ${data.table_number}\n`);
    this.addString(bytes, `Date: ${new Date(data.issued_at || data.requested_at).toLocaleString()}\n`);
    this.addString(bytes, this.divider('=', w) + '\n');

    // Item Table Header
    this.addString(bytes, this.formatTwoColumn('Item', 'Amount', w) + '\n');
    this.addString(bytes, this.divider('-', w) + '\n');

    // Items
    for (const item of data.items) {
      const qtyStr = `${item.quantity} x ₹${Number(item.unit_price).toFixed(2)}`;
      const lineTotalStr = `₹${Number(item.line_total).toFixed(2)}`;
      this.addString(bytes, `${item.name}\n`);
      this.addString(bytes, this.formatTwoColumn(`  ${qtyStr}`, lineTotalStr, w) + '\n');

      // Options
      if (item.selected_options && item.selected_options.length > 0) {
        for (const opt of item.selected_options) {
          this.addString(bytes, `   + ${opt.group_name}: ${opt.option_name}\n`);
        }
      } else if (item.options && item.options.length > 0) {
        for (const opt of item.options) {
          this.addString(bytes, `   + ${opt}\n`);
        }
      }
    }

    this.addString(bytes, this.divider('-', w) + '\n');

    // Totals
    this.addString(bytes, this.formatTwoColumn('Subtotal:', `₹${Number(data.subtotal).toFixed(2)}`, w) + '\n');

    if (data.cgst_amount && Number(data.cgst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('CGST:', `₹${Number(data.cgst_amount).toFixed(2)}`, w) + '\n');
    }
    if (data.sgst_amount && Number(data.sgst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('SGST:', `₹${Number(data.sgst_amount).toFixed(2)}`, w) + '\n');
    }
    if (data.igst_amount && Number(data.igst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('IGST:', `₹${Number(data.igst_amount).toFixed(2)}`, w) + '\n');
    }

    this.addString(bytes, this.divider('=', w) + '\n');
    this.addString(bytes, this.formatTwoColumn('TOTAL AMOUNT:', `₹${Number(data.total_amount).toFixed(2)}`, w) + '\n');
    this.addString(bytes, this.divider('=', w) + '\n');

    // Status Banner - Center Aligned
    bytes.push(0x1B, 0x61, 0x01);
    this.addString(bytes, `STATUS: ${data.status.toUpperCase()}\n`);
    if (data.payment_method) {
      this.addString(bytes, `Payment Method: ${data.payment_method}\n`);
    }
    this.addString(bytes, 'Thank you for dining with us!\n');

    // Feed lines
    bytes.push(0x1B, 0x64, this.feedLines);

    // Cut
    if (this.autoCut) {
      bytes.push(0x1D, 0x56, 0x41, 0x00);
    }

    return Buffer.from(bytes);
  }

  private addString(bytes: number[], str: string): void {
    // Replace ₹ with Rs. for basic CP437 ASCII compatibility fallback
    const asciiStr = str.replace(/₹/g, 'Rs.');
    for (let i = 0; i < asciiStr.length; i++) {
      bytes.push(asciiStr.charCodeAt(i));
    }
  }

  private divider(char: string, width: number): string {
    return char.repeat(width);
  }

  private formatTwoColumn(left: string, right: string, width: number): string {
    const spaceAvailable = width - right.length;
    if (left.length <= spaceAvailable) {
      return left + ' '.repeat(spaceAvailable - left.length) + right;
    }
    return left.slice(0, spaceAvailable - 1) + ' ' + right;
  }
}
