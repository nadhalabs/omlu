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
  address?: string;
  gstin?: string;
  created_at: string;
  paid_at?: string;
  status: 'draft' | 'issued' | 'payment_pending' | 'paid';
  items: ReceiptItemPayload[];
  subtotal: string;
  tax_amount: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  discount_amount?: string;
  taxable_amount?: string;
  grand_total: string;
  receipt_title: string;
  digital_bill_url: string;
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
  receipt_type: 'bill' | 'receipt' | 'test' | 'kitchen';
  receipt_data?: AuthoritativeReceiptPayload;
  kitchen_data?: KitchenTicketPayload;
  copy_count: number;
  created_at: string;
  expires_at: string;
  retry_count: number;
  signed_token: string;
}

export interface KitchenTicketPayload {
  document_type: 'initial_kot' | 'addition_kot' | 'cancellation_kot';
  service_type?: 'dine_in' | 'takeaway';
  heading?: string;
  table_number?: string;
  order_number: string;
  created_at?: string;
  customer_note?: string;
  note?: string;
  item_name?: string;
  quantity?: number;
  reason?: string;
  items?: Array<{ name: string; quantity: number; note?: string; options?: string[] }>;
}

export function validatePrintJob(job: any): { valid: boolean; reason?: string } {
  if (!job || typeof job !== 'object') return { valid: false, reason: 'INVALID_JOB_OBJECT' };
  if (job.schema_version !== '1.0') return { valid: false, reason: 'UNSUPPORTED_SCHEMA_VERSION' };
  if (!job.job_id) return { valid: false, reason: 'MISSING_JOB_ID' };
  if (!job.installation_id) return { valid: false, reason: 'MISSING_INSTALLATION_ID' };
  if (!job.tenant_id) return { valid: false, reason: 'MISSING_TENANT_ID' };
  if (!job.signed_token && job.receipt_type !== 'kitchen') return { valid: false, reason: 'MISSING_SIGNED_TOKEN' };

  if (job.receipt_type === 'kitchen') {
    if (!job.kitchen_data) return { valid: false, reason: 'MISSING_KITCHEN_CONTENT' };
    return { valid: true };
  }

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
  private qrMode: 'native' | 'raster';

  constructor(width: '58' | '80' = '58', autoCut: boolean = true, feedLines: number = 3, qrMode: 'native' | 'raster' = 'raster') {
    this.width = width === '80' ? 48 : 32;
    this.autoCut = autoCut;
    this.feedLines = feedLines;
    this.qrMode = qrMode;
  }

  public encodeTestPage(): Buffer {
    const bytes: number[] = [0x1B, 0x40, 0x1B, 0x61, 0x01];
    this.addString(bytes, 'OMLU QR TEST\n');
    this.addRasterQrCode(bytes, 'https://omlu.in/receipt/qr-test');
    this.addString(bytes, 'Scan me\n');

    // Feed lines
    bytes.push(0x1B, 0x64, this.feedLines);

    // Cut command if enabled
    if (this.autoCut) {
      bytes.push(0x1D, 0x56, 0x41, 0x00);
    }

    return Buffer.from(bytes);
  }

  public encodeKitchenTicket(data: KitchenTicketPayload): Buffer {
    const bytes: number[] = [0x1B, 0x40, 0x1B, 0x61, 0x01];
    const width = this.width;
    const heading = data.document_type === 'cancellation_kot' ? '*** CANCELLED ITEM ***'
      : data.document_type === 'addition_kot' ? '*** NEW ITEM ***' : '*** KITCHEN ORDER ***';
    this.addString(bytes, `${heading}\n${this.divider('=', width)}\n`);
    bytes.push(0x1B, 0x61, 0x00);
    this.addString(bytes, `${(data.service_type || 'dine_in').toUpperCase().replace('_', '-')}` + '\n');
    if (data.table_number) this.addString(bytes, `Table: ${data.table_number}\n`);
    this.addString(bytes, `Order: ${data.order_number}\n`);
    if (data.created_at) this.addString(bytes, `Time: ${new Date(data.created_at).toLocaleString()}\n`);
    this.addString(bytes, `${this.divider('-', width)}\n`);
    const items = data.items || (data.item_name ? [{ name: data.item_name, quantity: data.quantity || 1 }] : []);
    for (const item of items) {
      this.addString(bytes, `${item.quantity} x ${item.name}\n`);
      for (const option of item.options || []) this.addString(bytes, `  + ${option}\n`);
      if (item.note) this.addString(bytes, `  NOTE: ${item.note}\n`);
    }
    const note = data.customer_note || data.note;
    if (note) this.addString(bytes, `${this.divider('-', width)}\nNOTE: ${note}\n`);
    if (data.reason) this.addString(bytes, `REASON: ${data.reason}\n`);
    this.addString(bytes, `${this.divider('=', width)}\n`);
    bytes.push(0x1B, 0x64, this.feedLines);
    if (this.autoCut) bytes.push(0x1D, 0x56, 0x41, 0x00);
    return Buffer.from(bytes);
  }

  public encodeReceipt(data: AuthoritativeReceiptPayload): Buffer {
    const bytes: number[] = [];
    const w = this.width;

    // Init (ESC @)
    bytes.push(0x1B, 0x40);

    bytes.push(0x1B, 0x61, 0x01);
    bytes.push(0x1B, 0x45, 0x01);
    this.addString(bytes, `${data.restaurant_name.toUpperCase()}\n`);
    bytes.push(0x1B, 0x45, 0x00);
    if (data.legal_business_name) {
      this.addString(bytes, `${data.legal_business_name}\n`);
    }
    if (data.address) {
      this.addString(bytes, `${data.address}\n`);
    }
    if (data.gstin) {
      this.addString(bytes, `GSTIN: ${data.gstin}\n`);
    }

    bytes.push(0x1B, 0x45, 0x01);
    this.addString(bytes, `${data.receipt_title}\n`);
    bytes.push(0x1B, 0x45, 0x00);
    const status = data.status.toUpperCase();
    if (data.table_number) this.addString(bytes, `Table ${data.table_number} - ${status}\n`);

    bytes.push(0x1B, 0x61, 0x00);
    this.addString(bytes, `Bill: ${data.bill_number}\n`);
    if (data.invoice_number) {
      this.addString(bytes, `Invoice: ${data.invoice_number}\n`);
    }
    this.addString(bytes, `${this.compactDate(data.created_at)}\n`);
    if (!data.table_number) this.addString(bytes, `${status}\n`);
    this.addString(bytes, this.divider('-', w) + '\n');

    // Items
    for (const item of data.items) {
      const qtyStr = `${item.quantity} x ₹${Number(item.unit_price).toFixed(2)}`;
      const lineTotalStr = `₹${Number(item.line_total).toFixed(2)}`;
      for (const line of this.wrap(item.name, w)) this.addString(bytes, `${line}\n`);
      this.addString(bytes, this.formatTwoColumn(qtyStr, lineTotalStr, w) + '\n');

      // Options
      if (item.selected_options && item.selected_options.length > 0) {
        for (const opt of item.selected_options) {
          for (const line of this.wrap(`  + ${opt.option_name}`, w)) this.addString(bytes, `${line}\n`);
        }
      } else if (item.options && item.options.length > 0) {
        for (const opt of item.options) {
          for (const line of this.wrap(`  + ${opt}`, w)) this.addString(bytes, `${line}\n`);
        }
      }
    }

    this.addString(bytes, this.divider('-', w) + '\n');

    // Totals
    this.addString(bytes, this.formatTwoColumn('Subtotal:', `₹${Number(data.subtotal).toFixed(2)}`, w) + '\n');
    if (data.discount_amount && Number(data.discount_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('Discount:', `-₹${Number(data.discount_amount).toFixed(2)}`, w) + '\n');
    }
    if (data.taxable_amount && Number(data.taxable_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('Taxable:', `₹${Number(data.taxable_amount).toFixed(2)}`, w) + '\n');
    }

    if (data.cgst_amount && Number(data.cgst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('CGST:', `₹${Number(data.cgst_amount).toFixed(2)}`, w) + '\n');
    }
    if (data.sgst_amount && Number(data.sgst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('SGST:', `₹${Number(data.sgst_amount).toFixed(2)}`, w) + '\n');
    }
    if (data.igst_amount && Number(data.igst_amount) > 0) {
      this.addString(bytes, this.formatTwoColumn('IGST:', `₹${Number(data.igst_amount).toFixed(2)}`, w) + '\n');
    }

    bytes.push(0x1B, 0x45, 0x01);
    this.addString(bytes, this.formatTwoColumn('TOTAL:', `₹${Number(data.grand_total).toFixed(2)}`, w) + '\n');
    bytes.push(0x1B, 0x45, 0x00);
    this.addString(bytes, this.divider('-', w) + '\n');

    // Status Banner - Center Aligned
    bytes.push(0x1B, 0x61, 0x01);
    this.addString(bytes, `${status}${data.payment_method ? ` - ${data.payment_method.toUpperCase()}` : ''}\n`);
    this.addString(bytes, 'Thank you\n');

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

  public encodeNativeQr(value: string): Buffer {
    const bytes: number[] = [0x1B, 0x40, 0x1B, 0x61, 0x01];
    this.addNativeQrCode(bytes, value);
    return Buffer.from(bytes);
  }

  private addNativeQrCode(bytes: number[], value: string): void {
    const data = Buffer.from(value, 'ascii');
    const storeLength = data.length + 3;
    bytes.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, this.width === 48 ? 7 : 5);
    bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    bytes.push(0x1D, 0x28, 0x6B, storeLength & 0xff, (storeLength >> 8) & 0xff, 0x31, 0x50, 0x30, ...data);
    bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
  }

  private addRasterQrCode(bytes: number[], value: string): void {
    // Generic POS58/80 profiles cannot guarantee Epson native QR support.
    // Raster is deterministic GS v 0 output and remains scannable with a 4-module quiet zone.
    const QRCode = require('qrcode');
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const quiet = 4;
    const targetDots = this.width === 48 ? 240 : 200;
    const modules = qr.modules.size + quiet * 2;
    const scale = Math.max(1, Math.ceil(targetDots / modules));
    const size = modules * scale;
    const widthBytes = Math.ceil(size / 8);
    bytes.push(0x1D, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, size & 0xff, (size >> 8) & 0xff);
    for (let y = 0; y < size; y++) {
      for (let xb = 0; xb < widthBytes; xb++) {
        let packed = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          const mx = Math.floor(x / scale) - quiet;
          const my = Math.floor(y / scale) - quiet;
          if (x < size && mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(mx, my)) packed |= 0x80 >> bit;
        }
        bytes.push(packed);
      }
    }
    this.addString(bytes, '\n');
  }

  private compactDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  private wrap(value: string, width: number): string[] {
    const lines: string[] = [];
    let remaining = value.trim();
    while (remaining.length > width) {
      let split = remaining.lastIndexOf(' ', width);
      if (split < 1) split = width;
      lines.push(remaining.slice(0, split));
      remaining = remaining.slice(split).trimStart();
    }
    if (remaining) lines.push(remaining);
    return lines;
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
