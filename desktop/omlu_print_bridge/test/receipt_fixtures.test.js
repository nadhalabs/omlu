const test = require('node:test');
const assert = require('node:assert/strict');
const { DesktopEscPosEncoder } = require('../dist/contract');

const mockReceiptData = {
  bill_number: 'NS-20260805-0001',
  invoice_number: 'INV-001',
  table_number: '12',
  restaurant_name: 'Manga Manzil',
  legal_business_name: 'Manga Manzil Hospitality LLP',
  registered_billing_address: 'Kochi, Kerala',
  gstin: '32ABCDE1234F1Z5',
  requested_at: '2026-08-05T20:00:00Z',
  issued_at: '2026-08-05T20:05:00Z',
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
  total_amount: '378.00'
};

test('Golden receipt fixture encoding - 58 mm layout', () => {
  const encoder = new DesktopEscPosEncoder('58', true, 3);
  const buffer = encoder.encodeReceipt(mockReceiptData);

  assert.ok(Buffer.isBuffer(buffer));
  const outputText = buffer.toString('ascii');

  // Verify header & titles
  assert.match(outputText, /MANGA MANZIL/);
  assert.match(outputText, /\*\*\* TAX INVOICE \*\*\*/);
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
  assert.match(outputText, /TOTAL AMOUNT:/);
  assert.match(outputText, /378\.00/);

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
  assert.match(outputText, /TOTAL AMOUNT:/);
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
