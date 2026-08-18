const test = require('node:test');
const assert = require('node:assert/strict');
const { DesktopEscPosEncoder } = require('../dist/contract');

const mockReceiptData = {
  bill_number: 'NS-20260805-0001',
  invoice_number: 'INV-001',
  table_number: '12',
  restaurant_name: 'Manga Manzil',
  legal_business_name: 'Manga Manzil Hospitality LLP',
  address: 'Kochi, Kerala',
  gstin: '32ABCDE1234F1Z5',
  created_at: '2026-08-05T20:05:00Z',
  receipt_title: 'TAX INVOICE',
  digital_bill_url: 'https://omlu.in/receipt/secure-random-token',
  status: 'issued',
  items: [
    {
      name: 'Kerala Porotta Special',
      quantity: 2,
      unit_price: '40.00',
      line_total: '80.00',
      selected_options: [{ group_name: 'Spice Level', option_name: 'Medium', price_adjustment: '0.00' }]
    },
    {
      name: 'Chicken Varutharutha Curry (Full)',
      quantity: 1,
      unit_price: '280.00',
      line_total: '280.00'
    }
  ],
  subtotal: '360.00',
  tax_amount: '18.00',
  cgst_amount: '9.00',
  sgst_amount: '9.00',
  grand_total: '378.00'
};

test('Golden receipt fixture encoding - 58 mm layout', () => {
  const encoder = new DesktopEscPosEncoder('58', true, 3);
  const buffer = encoder.encodeReceipt(mockReceiptData);

  assert.ok(Buffer.isBuffer(buffer));
  const outputText = buffer.toString('ascii');

  // Verify header & titles
  assert.match(outputText, /MANGA MANZIL/);
  assert.match(outputText, /TAX INVOICE/);
  assert.match(outputText, /Bill #: NS-20260805-0001/);
  assert.match(outputText, /Table #: 12/);

  // Verify items
  assert.match(outputText, /Kerala Porotta Special/);
  assert.match(outputText, /Chicken Varutharutha Curry/);
  assert.match(outputText, /Spice Level: Medium/);

  // Verify GST breakdown
  assert.match(outputText, /Subtotal:/);
  assert.match(outputText, /CGST:/);
  assert.match(outputText, /SGST:/);
  assert.match(outputText, /TOTAL:/);
  assert.match(outputText, /378\.00/);
  assert.match(outputText, /VIEW YOUR DIGITAL BILL/);
  assert.ok(buffer.indexOf(Buffer.from([0x1D, 0x28, 0x6B])) > 0, 'QR command must be present');

  // Verify Cut command (0x1D, 0x56, 0x41, 0x00)
  const cutIndex = buffer.indexOf(Buffer.from([0x1D, 0x56, 0x41, 0x00]));
  assert.ok(cutIndex > 0, 'Cut command must be present in encoded receipt buffer');
});

test('Golden receipt fixture encoding - 80 mm layout', () => {
  const encoder = new DesktopEscPosEncoder('80', true, 4);
  const buffer = encoder.encodeReceipt(mockReceiptData);

  assert.ok(Buffer.isBuffer(buffer));
  const outputText = buffer.toString('ascii');

  assert.match(outputText, /MANGA MANZIL/);
  assert.match(outputText, /TOTAL:/);
  assert.match(outputText, /378\.00/);
});

test('Golden test page encoding', () => {
  const encoder = new DesktopEscPosEncoder('58', true, 3);
  const buffer = encoder.encodeTestPage();

  assert.ok(Buffer.isBuffer(buffer));
  const text = buffer.toString('ascii');

  assert.match(text, /OMLU PRINT BRIDGE TEST PAGE/);
  assert.match(text, /SUCCESSFUL TEST PRINT/);
});

test('Kitchen KOT encoding contains operational data and excludes billing data', () => {
  const encoder = new DesktopEscPosEncoder('58', true, 3);
  const buffer = encoder.encodeKitchenTicket({
    document_type: 'initial_kot', service_type: 'dine_in', table_number: '7',
    order_number: 'NS-42', created_at: '2026-08-17T10:00:00Z', customer_note: 'Less spicy',
    items: [{ name: 'Masala Dosa', quantity: 2, options: ['No onion'], note: 'Crispy' }],
  });
  const text = buffer.toString('ascii');
  assert.match(text, /KITCHEN ORDER/);
  assert.match(text, /DINE-IN/);
  assert.match(text, /Table: 7/);
  assert.match(text, /2 x Masala Dosa/);
  assert.match(text, /No onion/);
  assert.match(text, /Less spicy/);
  assert.doesNotMatch(text, /GST|TOTAL|PAYMENT|INVOICE/);
});

test('Kitchen cancellation slip is unmistakable', () => {
  const encoder = new DesktopEscPosEncoder('58', true, 3);
  const text = encoder.encodeKitchenTicket({ document_type: 'cancellation_kot', order_number: 'NS-43', item_name: 'Tea', quantity: 1, reason: 'Guest request' }).toString('ascii');
  assert.match(text, /CANCELLED ITEM/);
  assert.match(text, /1 x Tea/);
  assert.match(text, /Guest request/);
});
