import * as http from 'http';
import * as crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://omlu.in',
  'https://www.omlu.in',
  'https://omlu-staging.vercel.app',
  'https://app.omlu.in',
  'https://dashboard.omlu.app',
  'https://nadha-serve.onrender.com',
];

const usedNonces = new Set<string>();

const nonceCleanupTimer = setInterval(() => {
  // Clear nonce cache periodically
  usedNonces.clear();
}, 10 * 60 * 1000);
nonceCleanupTimer.unref();

let registeredPublicKeyPem: string | null = null;
let registeredPublicKey: crypto.KeyObject | null = null;

export function setPublicKeyPem(pem: string): void {
  registeredPublicKeyPem = pem;
  registeredPublicKey = crypto.createPublicKey(pem);
}

export function sanitizeErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';
  const msg = typeof error === 'string' ? error : error.message || String(error);

  if (msg.includes('ECONNREFUSED')) return 'Printer connection refused. Ensure network printer is powered on.';
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) return 'Printer communication timed out.';
  if (msg.includes('ENOENT')) return 'Printer device or COM port not found.';
  if (msg.includes('ACCESS_DENIED') || msg.includes('Permission denied')) return 'Printer access denied.';

  return 'Printer operation failed. Please check printer connection and configuration.';
}

export function validateOriginAndHost(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;

  // Echo only explicitly trusted web origins. Bridge requests can carry signed
  // credentials, so a wildcard origin is intentionally never authorized.
  res.setHeader('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bridge-Token, X-Bridge-Signature, X-Bridge-Timestamp, X-Bridge-Nonce');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return false;
  }

  // Host header validation.
  // Allow localhost and RFC1918 private IPv4 LAN addresses only.
  if (host) {
    const hostname = host.split(':')[0];

    const isAllowedHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    if (!isAllowedHost) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_HOST', message: 'Forbidden host header.' }));
      return false;
    }
  }

  return true;
}

export function verifySignedToken(
  token: string,
  expectedAction: string,
  publicKeyPem?: string
): { valid: boolean; payload?: any; reason?: string } {
  if (!token) return { valid: false, reason: 'MISSING_TOKEN' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'MALFORMED_TOKEN' };

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf-8');

  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    const signature = Buffer.from(sigB64, 'base64url');

    // 1. Header checks
    if (header.alg !== 'EdDSA' && header.alg !== 'HS256') {
      return { valid: false, reason: 'UNSUPPORTED_ALGORITHM' };
    }

    if (header.alg === 'EdDSA') {
      const pubKey = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : registeredPublicKey;
      if (!pubKey) {
        return { valid: false, reason: 'MISSING_PUBLIC_KEY' };
      }

      const verified = crypto.verify(null, signingInput, pubKey, signature);
      if (!verified) {
        return { valid: false, reason: 'INVALID_SIGNATURE' };
      }
    }

    // 2. Expiry & Lifetime checks
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }
    if (payload.iat && payload.iat > now + 5) {
      return { valid: false, reason: 'FUTURE_ISSUED_AT' };
    }
    if (payload.nbf && now < payload.nbf) {
      return { valid: false, reason: 'TOKEN_NOT_YET_VALID' };
    }

    // 3. Action scope check
    const validActions = ['bridge:pair', 'printer:configure', 'printer:test', 'bill:print', 'receipt:reprint'];
    if (!validActions.includes(payload.action)) {
      return { valid: false, reason: 'INVALID_ACTION_SCOPE' };
    }

    if (payload.action !== expectedAction) {
      return { valid: false, reason: `ACTION_MISMATCH: expected ${expectedAction}, got ${payload.action}` };
    }

    // 4. JTI Replay protection
    if (payload.jti) {
      if (usedNonces.has(payload.jti)) {
        return { valid: false, reason: 'NONCE_REPLAY_REJECTED' };
      }
      usedNonces.add(payload.jti);
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD' };
  }
}
