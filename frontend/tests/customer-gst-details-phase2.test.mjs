import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("components/billing/CustomerGstDetails.tsx");
const counter = read("app/admin/billing/BillingCounterClient.tsx");
const tableReview = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");
const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
const api = read("lib/api.ts");
const proxy = read("app/api/staff/bills/[billNumber]/customer-gst-details/route.ts");

test("customer GST dialog is optional, focused, validated, and jargon-free", () => {
  for (const copy of ["Add Customer GST Details", "Customer GST Details", "GSTIN", "Business Name", "Save GST Details", "Edit GST Details", "Remove GST Details"]) assert.ok(component.includes(copy), copy);
  assert.match(component, /GSTIN_PATTERN/);
  assert.match(component, /valid 15-character GSTIN/);
  assert.match(component, /toUpperCase\(\)/);
  assert.doesNotMatch(component, />B2B<|>B2C<|Customer tax type|recipient classification/i);
});

test("Billing Counter offers GST details only on drafts and renders issued details read-only", () => {
  assert.match(counter, /item\.status === "draft"/);
  assert.match(counter, /editable=\{item\.status === "draft" && item\.gst_enabled\}/);
  assert.match(counter, /item\.has_customer_gst_details \|\| \(item\.status === "draft" && item\.gst_enabled\)/);
  assert.match(counter, /updateBillCustomerGstDetails\(item\.bill_number, details\)/);
  assert.doesNotMatch(counter, />B2B<|>B2C<|Customer tax type/i);
});

test("Bill review reuses the same GST component without expanding staff authority", () => {
  assert.match(tableReview, /staffInfo\?\.role === "owner" \|\| staffInfo\?\.role === "admin"/);
  assert.match(tableReview, /bill\.status === "draft"/);
  assert.match(tableReview, /<CustomerGstDetails/);
  assert.match(tableReview, /editable=\{bill\.status === "draft" && bill\.gst_enabled\}/);
});

test("Bill GST helper sends the dedicated add-edit-remove contract through the authenticated proxy", () => {
  assert.match(api, /customer_gstin: details\?\.gstin \?\? null/);
  assert.match(api, /customer_legal_name: details\?\.businessName \?\? null/);
  assert.match(proxy, /staff_token/);
  assert.match(proxy, /method: "PUT"/);
  assert.match(proxy, /customer-gst-details/);
});

test("Quick Sale remains default when details are absent and adds location-aware payload only when requested", () => {
  assert.match(quickSale, /const \[customerGst, setCustomerGst\] = useState<CustomerGstValue \| null>\(null\)/);
  assert.match(quickSale, /customerGst \? \{/);
  assert.match(quickSale, /customer_tax_type: "b2b"/);
  assert.match(quickSale, /customer_state_code: customerGst\.gstin\.slice\(0, 2\)/);
  assert.match(quickSale, /place_of_supply_code: customerGst\.gstin\.slice\(0, 2\)/);
  assert.match(quickSale, /\.\.\.customerGstPayload/);
  assert.match(quickSale, /preview\?\.gst_enabled \|\| customerGst/);
  assert.match(quickSale, /setCustomerGst\(null\)/);
  assert.match(quickSale, /\[cart, customerGstPayload, payment, saleType\]/);
  assert.doesNotMatch(quickSale, />B2B<|>B2C<|Customer tax type/i);
});
