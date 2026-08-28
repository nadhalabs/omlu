import * as http from 'http';
import * as crypto from 'crypto';
import { ConfigManager, PrinterConfig, PrinterProfile, isPersistedPairingComplete } from './config';
import { validateOriginAndHost, verifySignedToken, sanitizeErrorMessage, setPublicKeyPem } from './security';
import { getBleCapability } from './capabilities/ble_capability';
import { PrintJobCoordinator } from './coordinator';
import { WindowsRawSpoolerTransport } from './transports/raw_spooler_transport';
import { WindowsDriverSpoolerTransport } from './transports/driver_spooler_transport';
import { TcpPrinterTransport } from './transports/tcp_transport';
import { SerialComPrinterTransport } from './transports/serial_com_transport';
import { MacOSSpoolerTransport } from './transports/macos_spooler_transport';
import { PrinterTransport } from './transports/transport';
import { KitchenPrintConsumer } from './kitchen_consumer';
import { discoverSystemPrinters, isSafePrivatePrinterHost, isSafePrinterQueueName } from './printer_discovery';

const PORT = 24242;
const HOST = '0.0.0.0';

export class PrintBridgeServer {
  private server: http.Server;
  private configManager: ConfigManager;
  private coordinator: PrintJobCoordinator;
  private activePairingCode: string | null = null;
  private activePairingExpiresAt = 0;
  private activePairingAttempts = 0;
  private kitchenConsumer: KitchenPrintConsumer;
  private startTime: number = Date.now();

  constructor(customConfigPath?: string) {
    this.configManager = new ConfigManager(customConfigPath);
    const config = this.configManager.getConfig();
    if (config.backendPublicKeyPem) setPublicKeyPem(config.backendPublicKeyPem);
    this.coordinator = new PrintJobCoordinator();
    this.kitchenConsumer = new KitchenPrintConsumer(this.configManager, this.coordinator);
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
      case 'macos_spooler':
        return new MacOSSpoolerTransport(config.queueName);
      default:
        return new WindowsRawSpoolerTransport(config.queueName);
    }
  }

  public getTransportForProfile(profile: PrinterProfile, config: PrinterConfig): PrinterTransport {
    if (profile.transport === 'tcp_lan' && profile.host) {
      return new TcpPrinterTransport(
        profile.host,
        profile.port || 9100,
        Math.min(config.connectTimeoutMs, 8000),
        Math.min(config.writeTimeoutMs, 8000),
        config.chunkSize,
        config.interChunkDelayMs
      );
    }
    if (profile.transport === 'windows_raw_spooler' && profile.queueName) {
      return new WindowsRawSpoolerTransport(profile.queueName);
    }
    if (profile.transport === 'windows_driver_spooler' && profile.queueName) {
      return new WindowsDriverSpoolerTransport(profile.queueName);
    }
    if (profile.transport === 'macos_spooler' && profile.queueName) {
      return new MacOSSpoolerTransport(profile.queueName);
    }
    return this.getTransport(config);
  }

  private getDefaultPrinterProfile(purpose: 'billing' | 'kitchen', config: PrinterConfig): PrinterProfile | null {
    const profiles = config.printers || [];
    const matching = profiles.filter((p) => p.purpose === purpose && p.enabled);
    const defaultProfile = matching.find((p) => p.is_default);
    if (defaultProfile) return defaultProfile;
    if (matching.length > 0) return matching[0];

    // Fallback to legacy fields if profiles array is empty
    if (purpose === 'billing' && config.billingPrinterEnabled && config.billingPrinterHost) {
      return {
        id: 'legacy_billing',
        name: config.billingPrinterName || 'Billing Printer',
        purpose: 'billing',
        transport: 'tcp_lan',
        host: config.billingPrinterHost,
        port: config.billingPrinterPort || 9100,
        paperWidth: '80',
        enabled: true,
        is_default: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (purpose === 'kitchen' && config.kitchenPrinterEnabled && config.kitchenPrinterHost) {
      return {
        id: 'legacy_kitchen',
        name: config.kitchenPrinterName || 'Kitchen Printer',
        purpose: 'kitchen',
        transport: 'tcp_lan',
        host: config.kitchenPrinterHost,
        port: config.kitchenPrinterPort || 9100,
        paperWidth: '80',
        enabled: true,
        is_default: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!validateOriginAndHost(req, res)) return;

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    try {
      if (method === 'GET' && path === '/v1/health') {
        const config = this.configManager.getConfig();
        const defaultBilling = this.getDefaultPrinterProfile('billing', config);
        const defaultKitchen = this.getDefaultPrinterProfile('kitchen', config);

        const printerReadiness = Object.fromEntries(await Promise.all((config.printers || []).map(async (profile) => {
          if (!profile.enabled) return [profile.id, false] as const;
          const transport = this.getTransportForProfile(profile, config);
          return [profile.id, await transport.testConnection()] as const;
        })));
        let isOnline = defaultBilling ? Boolean(printerReadiness[defaultBilling.id]) : false;
        if (!defaultBilling) {
          const transport = this.getTransport(config);
          isOnline = await transport.testConnection();
        }

        return this.json(res, 200, {
          bridge_version: '1.0.0',
          operating_system: process.platform,
          readiness: 'ready',
          configured_printer: defaultBilling?.name || config.printerName,
          active_transport: defaultBilling?.transport || config.transport,
          supported_transports: ['windows_raw_spooler', 'windows_driver_spooler', 'macos_spooler', 'tcp_lan', 'bluetooth_com'],
          active_job_id: this.coordinator.getActiveJobId(),
          printer_online: isOnline,
          printer_readiness: printerReadiness,
          installation_id: config.installationId || null,
          tenant_id: config.tenantId || null,
          paired: isPersistedPairingComplete(config),
          kitchen_printer_configured: Boolean(defaultKitchen?.enabled),
          kitchen_printer_name: defaultKitchen?.name || config.kitchenPrinterName,
          kitchen_printer_host: defaultKitchen?.host || config.kitchenPrinterHost,
          kitchen_printer_port: defaultKitchen?.port || config.kitchenPrinterPort,
          billing_printer_configured: Boolean(defaultBilling?.enabled),
          billing_printer_name: defaultBilling?.name || config.billingPrinterName,
          billing_printer_host: defaultBilling?.host || config.billingPrinterHost,
          billing_printer_port: defaultBilling?.port || config.billingPrinterPort,
          printers: config.printers || [],
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

      if ((method === 'POST' || method === 'GET') && (path === '/v1/printers/discover' || path === '/v1/printer-discovery')) {
        const auth = this.authorizeLocalAction(req, 'printer:configure');
        if (!auth.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: auth.reason });
        const discovered = await discoverSystemPrinters();
        return this.json(res, 200, { printers: discovered, bounded: true });
      }

      if (method === 'POST' && path === '/v1/pairing/code') {
        this.activePairingCode = `${crypto.randomInt(100000, 1000000)}`;
        this.activePairingExpiresAt = Date.now() + 300_000;
        this.activePairingAttempts = 0;
        return this.json(res, 200, { pairing_code: this.activePairingCode, expires_in_seconds: 300 });
      }

      if (method === 'POST' && path === '/v1/pairing/confirm') {
        const body = await this.readJson(req);
        const expired = Date.now() >= this.activePairingExpiresAt;
        const exhausted = this.activePairingAttempts >= 3;
        if (!body.pairing_code || expired || exhausted || body.pairing_code !== this.activePairingCode) {
          this.activePairingAttempts += 1;
          if (expired || this.activePairingAttempts >= 3) {
            this.activePairingCode = null;
            this.activePairingExpiresAt = 0;
          }
          return this.json(res, 400, { error: 'INVALID_PAIRING_CODE', message: 'Invalid or expired pairing code.' });
        }
        this.activePairingCode = null;
        this.activePairingExpiresAt = 0;
        this.activePairingAttempts = 0;
        if (!body.backend_public_key_pem || !body.backend_url || !body.credential_secret || !body.tenant_id) {
          return this.json(res, 422, { error: 'INCOMPLETE_PAIRING', message: 'Pairing details are incomplete.' });
        }
        try {
          setPublicKeyPem(String(body.backend_public_key_pem));
        } catch {
          return this.json(res, 422, { error: 'INVALID_PUBLIC_KEY', message: 'Pairing security key is invalid.' });
        }
        this.configManager.saveConfig({
          installationId: body.installation_id || `inst_${crypto.randomBytes(8).toString('hex')}`,
          tenantId: String(body.tenant_id),
          backendUrl: String(body.backend_url).replace(/\/$/, ''),
          backendPublicKeyPem: String(body.backend_public_key_pem),
          credentialSecret: String(body.credential_secret),
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

      // ── Printer Profiles (Multi-Printer Management) ──────────────────────────

      if (method === 'GET' && path === '/v1/printer-profiles') {
        const config = this.configManager.getConfig();
        return this.json(res, 200, { printers: config.printers || [] });
      }

      if (method === 'POST' && path === '/v1/printer-profiles') {
        const auth = this.authorizeLocalAction(req, 'printer:configure');
        if (!auth.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: auth.reason });
        const body = await this.readJson(req);
        if (!body.name || !body.purpose) {
          return this.json(res, 422, { error: 'INVALID_PROFILE', message: 'Printer name and purpose are required.' });
        }
        const config = this.configManager.getConfig();
        const currentProfiles = config.printers || [];

        const isDefault = Boolean(body.is_default) || currentProfiles.filter((p) => p.purpose === body.purpose).length === 0;

        const updatedProfiles = currentProfiles.map((p) => {
          if (isDefault && p.purpose === body.purpose) {
            return { ...p, is_default: false };
          }
          return p;
        });

        const transport = body.transport === 'macos_spooler' ? 'macos_spooler'
          : body.transport === 'windows_raw_spooler' ? 'windows_raw_spooler'
          : body.transport === 'windows_driver_spooler' ? 'windows_driver_spooler'
          : body.transport === 'bluetooth_com' ? 'bluetooth_com' : 'tcp_lan';
        const port = body.port === undefined ? undefined : Number(body.port);
        const host = body.host ? String(body.host).trim() : undefined;
        if (transport === 'tcp_lan' && (!host || !isSafePrivatePrinterHost(host) || !Number.isInteger(port) || port! < 1 || port! > 65535)) {
          return this.json(res, 422, { error: 'INVALID_NETWORK_TARGET', message: 'Use a private local-network IPv4 address and a valid printer port.' });
        }
        if ((transport === 'windows_raw_spooler' || transport === 'windows_driver_spooler' || transport === 'macos_spooler') && (!body.queueName || !isSafePrinterQueueName(String(body.queueName)))) {
          return this.json(res, 422, { error: 'INVALID_QUEUE', message: 'Choose an installed printer queue.' });
        }
        const newProfile: PrinterProfile = {
          id: `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: String(body.name).trim().slice(0, 100),
          purpose: body.purpose === 'kitchen' ? 'kitchen' : 'billing',
          transport,
          host,
          port,
          queueName: body.queueName ? String(body.queueName).trim() : undefined,
          paperWidth: body.paperWidth === '58' ? '58' : '80',
          enabled: body.enabled !== false,
          is_default: isDefault,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        updatedProfiles.push(newProfile);

        // Update legacy default fields if this is default
        const legacyUpdate: Partial<PrinterConfig> = { printers: updatedProfiles };
        if (isDefault && newProfile.purpose === 'billing') {
          legacyUpdate.billingPrinterEnabled = newProfile.enabled;
          legacyUpdate.billingPrinterName = newProfile.name;
          legacyUpdate.billingPrinterHost = newProfile.host || '';
          legacyUpdate.billingPrinterPort = newProfile.port || 9100;
        }
        if (isDefault && newProfile.purpose === 'kitchen') {
          legacyUpdate.kitchenPrinterEnabled = newProfile.enabled;
          legacyUpdate.kitchenPrinterName = newProfile.name;
          legacyUpdate.kitchenPrinterHost = newProfile.host || '';
          legacyUpdate.kitchenPrinterPort = newProfile.port || 9100;
        }

        this.configManager.saveConfig(legacyUpdate);
        return this.json(res, 200, { status: 'success', profile: newProfile });
      }

      if ((method === 'PUT' || method === 'POST') && path.startsWith('/v1/printer-profiles/')) {
        const id = path.replace('/v1/printer-profiles/', '').split('/')[0];
        const subAction = path.endsWith('/set-default') ? 'set-default' : path.endsWith('/test') ? 'test' : 'update';
        const auth = this.authorizeLocalAction(req, subAction === 'test' ? 'printer:test' : 'printer:configure');
        if (!auth.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: auth.reason });
        const config = this.configManager.getConfig();
        const currentProfiles = config.printers || [];
        const target = currentProfiles.find((p) => p.id === id);

        if (!target) {
          return this.json(res, 404, { error: 'NOT_FOUND', message: 'Printer profile not found.' });
        }

        if (subAction === 'set-default') {
          const updatedProfiles = currentProfiles.map((p) => ({
            ...p,
            is_default: p.id === id,
            updatedAt: p.id === id ? new Date().toISOString() : p.updatedAt,
          }));
          const updatedTarget = updatedProfiles.find((p) => p.id === id)!;
          const legacyUpdate: Partial<PrinterConfig> = { printers: updatedProfiles };
          if (updatedTarget.purpose === 'billing') {
            legacyUpdate.billingPrinterEnabled = updatedTarget.enabled;
            legacyUpdate.billingPrinterName = updatedTarget.name;
            legacyUpdate.billingPrinterHost = updatedTarget.host || '';
            legacyUpdate.billingPrinterPort = updatedTarget.port || 9100;
          } else {
            legacyUpdate.kitchenPrinterEnabled = updatedTarget.enabled;
            legacyUpdate.kitchenPrinterName = updatedTarget.name;
            legacyUpdate.kitchenPrinterHost = updatedTarget.host || '';
            legacyUpdate.kitchenPrinterPort = updatedTarget.port || 9100;
          }
          this.configManager.saveConfig(legacyUpdate);
          return this.json(res, 200, { status: 'success', profile: updatedTarget });
        }

        if (subAction === 'test') {
          const transport = this.getTransportForProfile(target, config);
          const testJob = target.purpose === 'kitchen' ? {
            schema_version: '1.0' as const, job_id: `test_k_${Date.now()}`, idempotency_key: `test_k_${Date.now()}`,
            installation_id: config.installationId, tenant_id: config.tenantId, receipt_type: 'kitchen' as const, copy_count: 1,
            created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), retry_count: 0, signed_token: '',
            kitchen_data: { document_type: 'initial_kot' as const, service_type: 'dine_in' as const, order_number: 'TEST',
              customer_note: `OMLU KITCHEN PRINTER TEST | ${new Date().toLocaleString()} | Printer: ${target.name}`, items: [] },
          } : {
            schema_version: '1.0' as const, job_id: `test_b_${Date.now()}`, idempotency_key: `test_b_${Date.now()}`,
            installation_id: config.installationId, tenant_id: config.tenantId, receipt_type: 'test' as const, copy_count: 1,
            created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), retry_count: 0, signed_token: '',
          };
          const result = await this.coordinator.executePrintJob(testJob, config, transport);
          if (result.state === 'completed') {
            const testedAt = new Date().toISOString();
            this.configManager.saveConfig({ printers: currentProfiles.map((profile) => profile.id === target.id ? { ...profile, lastSuccessfulTestAt: testedAt, updatedAt: testedAt } : profile) });
          }
          return this.json(res, result.state === 'completed' ? 200 : 503, { success: result.state === 'completed', message: result.state === 'completed' ? 'Test job was accepted by the printer connection.' : (result.error || 'Printer unavailable.') });
        }

        // Standard profile update
        const body = await this.readJson(req);
        const nextTransport = body.transport || target.transport;
        const nextHost = body.host !== undefined ? String(body.host).trim() : target.host;
        const nextPort = body.port !== undefined ? Number(body.port) : target.port;
        if (nextTransport === 'tcp_lan' && (!nextHost || !isSafePrivatePrinterHost(nextHost) || !Number.isInteger(nextPort) || nextPort! < 1 || nextPort! > 65535)) {
          return this.json(res, 422, { error: 'INVALID_NETWORK_TARGET', message: 'Use a private local-network IPv4 address and a valid printer port.' });
        }
        const nextQueue = body.queueName !== undefined ? String(body.queueName).trim() : target.queueName;
        if ((nextTransport === 'windows_raw_spooler' || nextTransport === 'windows_driver_spooler' || nextTransport === 'macos_spooler') && (!nextQueue || !isSafePrinterQueueName(nextQueue))) {
          return this.json(res, 422, { error: 'INVALID_QUEUE', message: 'Choose a valid installed printer name.' });
        }
        const updatedProfiles = currentProfiles.map((p) => {
          if (p.id === id) {
            return {
              ...p,
              name: body.name ? String(body.name).trim() : p.name,
              purpose: body.purpose ? (body.purpose === 'kitchen' ? 'kitchen' : 'billing') : p.purpose,
              transport: body.transport || p.transport,
              host: body.host !== undefined ? String(body.host).trim() : p.host,
              port: body.port !== undefined ? Number(body.port) : p.port,
              queueName: body.queueName !== undefined ? String(body.queueName).trim() : p.queueName,
              paperWidth: body.paperWidth === '58' ? '58' : body.paperWidth === '80' ? '80' : p.paperWidth,
              enabled: body.enabled !== undefined ? Boolean(body.enabled) : p.enabled,
              is_default: body.is_default !== undefined ? Boolean(body.is_default) : p.is_default,
              updatedAt: new Date().toISOString(),
            };
          }
          return p;
        });

        this.configManager.saveConfig({ printers: updatedProfiles });
        const updatedProfile = updatedProfiles.find((p) => p.id === id);
        return this.json(res, 200, { status: 'success', profile: updatedProfile });
      }

      if (method === 'DELETE' && path.startsWith('/v1/printer-profiles/')) {
        const auth = this.authorizeLocalAction(req, 'printer:configure');
        if (!auth.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: auth.reason });
        const id = path.replace('/v1/printer-profiles/', '').trim();
        const config = this.configManager.getConfig();
        const currentProfiles = config.printers || [];
        const updatedProfiles = currentProfiles.filter((p) => p.id !== id);

        this.configManager.saveConfig({ printers: updatedProfiles });
        return this.json(res, 200, { status: 'deleted', id });
      }

      // ── Diagnostics & Job History ─────────────────────────────────────────────

      if (method === 'GET' && path === '/v1/diagnostics') {
        const config = this.configManager.getConfig();
        return this.json(res, 200, {
          bridge_version: '1.0.0',
          operating_system: process.platform,
          installation_id: config.installationId || null,
          tenant_id: config.tenantId || null,
          paired: isPersistedPairingComplete(config),
          uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
          active_job_id: this.coordinator.getActiveJobId(),
          supported_transports: ['windows_raw_spooler', 'windows_driver_spooler', 'macos_spooler', 'tcp_lan', 'bluetooth_com'],
          printers: (config.printers || []).map((p) => ({
            id: p.id,
            name: p.name,
            purpose: p.purpose,
            transport: p.transport,
            host: p.host || null,
            port: p.port || null,
            enabled: p.enabled,
            is_default: p.is_default,
          })),
        });
      }

      if (method === 'GET' && path === '/v1/recent-jobs') {
        return this.json(res, 200, { jobs: this.coordinator.getRecentJobs(20) });
      }

      // ── Legacy Setup Endpoints ────────────────────────────────────────────────

      if (method === 'POST' && path === '/v1/kitchen-printer/setup') {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:configure');
        if (!sec.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        const body = await this.readJson(req);
        const port = Number(body.kitchenPrinterPort || 9100);
        if (!body.kitchenPrinterHost || !Number.isInteger(port) || port < 1 || port > 65535) {
          return this.json(res, 422, { error: 'INVALID_KITCHEN_PRINTER', message: 'Enter a valid kitchen printer host and port.' });
        }
        this.configManager.saveConfig({
          kitchenPrinterEnabled: true,
          kitchenPrinterName: String(body.kitchenPrinterName || 'Kitchen Printer').slice(0, 100),
          kitchenPrinterHost: String(body.kitchenPrinterHost).trim(), kitchenPrinterPort: port,
        });
        this.kitchenConsumer.start();
        return this.json(res, 200, { status: 'configured' });
      }

      if (method === 'POST' && path === '/v1/kitchen-printer/test') {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:test');
        if (!sec.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        const config = this.configManager.getConfig();
        const defaultKitchen = this.getDefaultPrinterProfile('kitchen', config);
        if (!defaultKitchen) return this.json(res, 409, { error: 'NOT_CONFIGURED', message: 'Kitchen printer is not configured.' });
        const transport = this.getTransportForProfile(defaultKitchen, config);
        const result = await this.coordinator.executePrintJob({
          schema_version: '1.0', job_id: `kitchen_test_${Date.now()}`, idempotency_key: `kitchen_test_${Date.now()}`,
          installation_id: config.installationId, tenant_id: config.tenantId, receipt_type: 'kitchen', copy_count: 1,
          created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), retry_count: 0, signed_token: '',
          kitchen_data: { document_type: 'initial_kot', service_type: 'dine_in', order_number: 'TEST',
            customer_note: `OMLU KITCHEN PRINTER TEST | ${new Date().toLocaleString()} | Printer: ${defaultKitchen.name}`, items: [] },
        }, config, transport);
        return this.json(res, result.state === 'completed' ? 200 : 503, { success: result.state === 'completed', message: result.state === 'completed' ? 'Kitchen printer test completed.' : 'Kitchen printer unavailable.' });
      }

      if (method === 'POST' && path === '/v1/billing-printer/setup') {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:configure');
        if (!sec.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        const body = await this.readJson(req);
        const port = Number(body.billingPrinterPort || 9100);
        if (!body.billingPrinterHost || !Number.isInteger(port) || port < 1 || port > 65535) {
          return this.json(res, 422, { error: 'INVALID_BILLING_PRINTER', message: 'Enter a valid billing printer host and port.' });
        }
        this.configManager.saveConfig({
          billingPrinterEnabled: true,
          billingPrinterName: String(body.billingPrinterName || 'Billing Printer').slice(0, 100),
          billingPrinterHost: String(body.billingPrinterHost).trim(),
          billingPrinterPort: port,
        });
        return this.json(res, 200, { status: 'configured' });
      }

      if (method === 'POST' && path === '/v1/billing-printer/test') {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:test');
        if (!sec.valid) return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        const config = this.configManager.getConfig();
        const defaultBilling = this.getDefaultPrinterProfile('billing', config);
        if (!defaultBilling) return this.json(res, 409, { error: 'NOT_CONFIGURED', message: 'Billing printer is not configured.' });
        const billingTransport = this.getTransportForProfile(defaultBilling, config);
        const result = await this.coordinator.executePrintJob({
          schema_version: '1.0', job_id: `billing_test_${Date.now()}`, idempotency_key: `billing_test_${Date.now()}`,
          installation_id: config.installationId, tenant_id: config.tenantId, receipt_type: 'test', copy_count: 1,
          created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), retry_count: 0, signed_token: token,
        }, config, billingTransport);
        return this.json(res, result.state === 'completed' ? 200 : 503, { success: result.state === 'completed', message: result.state === 'completed' ? 'Billing printer test completed.' : 'Billing printer unavailable.' });
      }

      if (method === 'POST' && path === '/v1/printers/test') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const sec = verifySignedToken(token, 'printer:test');
        if (!sec.valid) {
          return this.json(res, 401, { error: 'UNAUTHORIZED', message: sec.reason });
        }

        const config = this.configManager.getConfig();
        const defaultBilling = this.getDefaultPrinterProfile('billing', config);
        const transport = defaultBilling ? this.getTransportForProfile(defaultBilling, config) : this.getTransport(config);
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
        const purpose = body.receipt_type === 'kitchen' ? 'kitchen' : 'billing';
        const defaultProfile = this.getDefaultPrinterProfile(purpose, config);
        const transport = defaultProfile ? this.getTransportForProfile(defaultProfile, config) : this.getTransport(config);
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

  private authorizeLocalAction(req: http.IncomingMessage, action: string): { valid: boolean; reason?: string } {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const verified = verifySignedToken(token, action);
    if (!verified.valid) return verified;
    const config = this.configManager.getConfig();
    if (!isPersistedPairingComplete(config)) return { valid: false, reason: 'INCOMPLETE_PAIRING' };
    if (verified.payload?.installation_id !== config.installationId || String(verified.payload?.tenant_id) !== String(config.tenantId)) {
      return { valid: false, reason: 'INSTALLATION_OR_TENANT_MISMATCH' };
    }
    return { valid: true };
  }

  private json(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  public listen(port: number = PORT, host: string = HOST): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        this.kitchenConsumer.start();
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    this.kitchenConsumer.stop();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  public stop(): Promise<void> {
    return this.close();
  }
}

if (require.main === module) {
  const server = new PrintBridgeServer();
  server.listen(PORT, HOST).then(() => {
    console.log(`OMLU Print Bridge Server listening on http://${HOST}:${PORT}`);
  });
}
