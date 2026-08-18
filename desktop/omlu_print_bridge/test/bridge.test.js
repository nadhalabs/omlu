const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PrintBridgeServer } = require('../dist/server');
const { verifySignedToken, sanitizeErrorMessage, setPublicKeyPem } = require('../dist/security');
const { getBleCapability } = require('../dist/capabilities/ble_capability');
const { defaultConfig, isPersistedPairingComplete } = require('../dist/config');

// Generate test Ed25519 key pair for unit tests
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
setPublicKeyPem(publicKeyPem);

function makeEd25519Token(action, billId = null, expInSeconds = 300, overrideClaims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'omlu-print-bridge-key-v1' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payloadData = {
    iss: 'omlu-backend',
    aud: 'omlu-print-bridge',
    sub: 'user-1',
    tenant_id: 'tenant-1',
    installation_id: 'inst-1',
    action,
    credential_version: 1,
    jti: `jti_${Math.random()}`,
    iat: now,
    nbf: now,
    exp: now + expInSeconds,
    ...overrideClaims,
  };
  if (billId) payloadData.bill_id = billId;

  const payload = Buffer.from(JSON.stringify(payloadData)).toString('base64url');
  const sigInput = Buffer.from(`${header}.${payload}`, 'utf-8');
  const sig = crypto.sign(null, sigInput, privateKey).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

test('Ed25519 signed token verification and action scoping', () => {
  const token = makeEd25519Token('bill:print', 'BILL-100');
  const res = verifySignedToken(token, 'bill:print', publicKeyPem);
  assert.equal(res.valid, true);
  assert.equal(res.payload.action, 'bill:print');
  assert.equal(res.payload.bill_id, 'BILL-100');

  // Mismatched action rejection
  const mismatch = verifySignedToken(token, 'printer:configure', publicKeyPem);
  assert.equal(mismatch.valid, false);
  assert.match(mismatch.reason, /ACTION_MISMATCH/);
});

test('Expired signed token is rejected', () => {
  const expiredToken = makeEd25519Token('printer:test', null, -10);
  const res = verifySignedToken(expiredToken, 'printer:test', publicKeyPem);
  assert.equal(res.valid, false);
  assert.equal(res.reason, 'TOKEN_EXPIRED');
});

test('Replayed token JTI is rejected', () => {
  const token = makeEd25519Token('printer:test', null, 300, { jti: 'static_jti_replay_test' });
  const res1 = verifySignedToken(token, 'printer:test', publicKeyPem);
  assert.equal(res1.valid, true);

  const res2 = verifySignedToken(token, 'printer:test', publicKeyPem);
  assert.equal(res2.valid, false);
  assert.equal(res2.reason, 'NONCE_REPLAY_REJECTED');
});

test('BLE capability explicitly reports unsupported status', () => {
  const report = getBleCapability();
  assert.equal(report.transport, 'bluetoothLowEnergy');
  assert.equal(report.supported, false);
  assert.equal(report.reasonCode, 'WINDOWS_BLE_NOT_SUPPORTED_IN_THIS_RELEASE');
});

test('Sanitizes error messages cleanly without exposing stack traces', () => {
  assert.equal(sanitizeErrorMessage('ECONNREFUSED 192.168.1.100:9100'), 'Printer connection refused. Ensure network printer is powered on.');
  assert.equal(sanitizeErrorMessage('ETIMEDOUT write'), 'Printer communication timed out.');
  assert.equal(sanitizeErrorMessage(new Error('ENOENT COM1')), 'Printer device or COM port not found.');
});

test('Persisted pairing health requires the complete security configuration', () => {
  assert.equal(isPersistedPairingComplete(defaultConfig), false);
  assert.equal(isPersistedPairingComplete({ ...defaultConfig,
    installationId: 'inst-1', tenantId: 'tenant-1', pairedAt: new Date().toISOString(), backendUrl: 'https://omlu.in',
    backendPublicKeyPem: publicKeyPem, credentialSecret: 'secret', kitchenPrinterEnabled: false,
  }), true);
  assert.equal(isPersistedPairingComplete({ ...defaultConfig,
    installationId: 'inst-1', kitchenPrinterEnabled: true, kitchenPrinterHost: '192.168.1.20',
  }), false);
});

test('HTTP API Server health and capabilities endpoints', async () => {
  const tmpConfig = path.join(os.tmpdir(), `test_config_${Date.now()}.json`);
  const server = new PrintBridgeServer(tmpConfig);
  await server.listen(24299, '127.0.0.1');

  try {
    // GET /v1/health
    const healthRes = await fetch('http://127.0.0.1:24299/v1/health');
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.bridge_version, '1.0.0');
    assert.equal(health.readiness, 'ready');
    assert.equal(health.paired, false);
    assert.equal(health.tenant_id, null);
    assert.ok(Array.isArray(health.supported_transports));

    // Hosted OMLU origin receives explicit CORS/PNA authorization.
    for (const origin of ['https://omlu.in', 'https://www.omlu.in', 'https://omlu-staging.vercel.app']) {
      const corsHealthRes = await fetch('http://127.0.0.1:24299/v1/health', {
        headers: { Origin: origin },
      });
      assert.equal(corsHealthRes.status, 200);
      assert.equal(corsHealthRes.headers.get('access-control-allow-origin'), origin);
      assert.equal(corsHealthRes.headers.get('access-control-allow-private-network'), 'true');
      assert.match(corsHealthRes.headers.get('vary') || '', /Origin/);
    }

    const preflightRes = await fetch('http://127.0.0.1:24299/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://omlu-staging.vercel.app',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    assert.equal(preflightRes.status, 204);
    assert.equal(preflightRes.headers.get('access-control-allow-origin'), 'https://omlu-staging.vercel.app');
    assert.equal(preflightRes.headers.get('access-control-allow-private-network'), 'true');
    assert.match(preflightRes.headers.get('access-control-allow-methods') || '', /GET/);
    assert.match(preflightRes.headers.get('access-control-allow-headers') || '', /Authorization/);
    assert.match(preflightRes.headers.get('vary') || '', /Origin/);

    const unknownOriginRes = await fetch('http://127.0.0.1:24299/v1/health', {
      headers: { Origin: 'https://example.invalid' },
    });
    assert.equal(unknownOriginRes.status, 200);
    assert.equal(unknownOriginRes.headers.get('access-control-allow-origin'), null);

    // GET /v1/capabilities
    const capRes = await fetch('http://127.0.0.1:24299/v1/capabilities');
    assert.equal(capRes.status, 200);
    const caps = await capRes.json();
    assert.ok(Array.isArray(caps.transports));
    const bleCap = caps.transports.find(t => t.transport === 'bluetoothLowEnergy');
    assert.equal(bleCap.supported, false);

    // POST /v1/pairing/code
    const codeRes = await fetch('http://127.0.0.1:24299/v1/pairing/code', { method: 'POST' });
    assert.equal(codeRes.status, 200);
    const codeData = await codeRes.json();
    assert.ok(codeData.pairing_code);

    const wrongConfirmRes = await fetch('http://127.0.0.1:24299/v1/pairing/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: '000000' }),
    });
    assert.equal(wrongConfirmRes.status, 400);
    assert.equal((await wrongConfirmRes.json()).message, 'Invalid or expired pairing code.');

    // POST /v1/pairing/confirm
    const confirmRes = await fetch('http://127.0.0.1:24299/v1/pairing/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: codeData.pairing_code, installation_id: 'inst_test_1', tenant_id: 'tenant-1',
        backend_url: 'https://omlu.in', backend_public_key_pem: publicKeyPem, credential_secret: 'device-only-secret' })
    });
    assert.equal(confirmRes.status, 200);
    const confirmData = await confirmRes.json();
    assert.equal(confirmData.status, 'paired');
    const pairedHealthRes = await fetch('http://127.0.0.1:24299/v1/health');
    const pairedHealth = await pairedHealthRes.json();
    assert.equal(pairedHealth.paired, true);
    assert.equal(pairedHealth.tenant_id, 'tenant-1');
    assert.equal(pairedHealth.billing_printer_configured, false);

    // POST /v1/billing-printer/setup
    const token = makeEd25519Token('printer:configure');
    const billingSetupRes = await fetch('http://127.0.0.1:24299/v1/billing-printer/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ billingPrinterName: 'Front Billing Printer', billingPrinterHost: '192.168.1.101', billingPrinterPort: 9100 }),
    });
    assert.equal(billingSetupRes.status, 200);

    const postBillingHealthRes = await fetch('http://127.0.0.1:24299/v1/health');
    const postBillingHealth = await postBillingHealthRes.json();
    assert.equal(postBillingHealth.billing_printer_configured, true);
    assert.equal(postBillingHealth.billing_printer_name, 'Front Billing Printer');
    assert.equal(postBillingHealth.billing_printer_host, '192.168.1.101');
    assert.equal(postBillingHealth.billing_printer_port, 9100);

    const persistedPairing = fs.readFileSync(tmpConfig, 'utf8');
    assert.doesNotMatch(persistedPairing, /PRIVATE KEY|exchange_token/i);
  } finally {
    await server.close();
    if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
  }
});
