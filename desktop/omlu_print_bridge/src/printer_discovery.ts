import { execFile } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';
import { DeviceInfo } from './transports/transport';

const execFileAsync = promisify(execFile);
export const DISCOVERY_TIMEOUT_MS = 5000;

export function classifyConnection(value = ''): DeviceInfo['connectionType'] {
  const text = value.toLowerCase();
  if (/usb|dot4/.test(text)) return 'usb';
  if (/bluetooth|\bbt\b/.test(text)) return 'bluetooth';
  if (/ipp|ipps|dnssd|bonjour|socket|tcp|w[sS]d|https?:/.test(text)) return 'network';
  return 'system';
}

export function parseMacPrinters(printersOutput: string, devicesOutput: string, defaultOutput: string): DeviceInfo[] {
  const devices = new Map<string, string>();
  for (const line of devicesOutput.split(/\r?\n/)) {
    const match = line.match(/^device for ([^:]+):\s*(.+)$/);
    if (match) devices.set(match[1], match[2]);
  }
  const defaultQueue = defaultOutput.match(/system default destination:\s*(\S+)/i)?.[1];
  return printersOutput.split(/\r?\n/).filter((line) => line.startsWith('printer ')).map((line) => {
    const queueName = line.slice(8).split(/\s+/)[0];
    const uri = devices.get(queueName) || '';
    return { id: `macos:${queueName}`, name: queueName.replace(/_/g, ' '), transport: 'macos_spooler', queueName,
      description: classifyConnection(uri) === 'network' ? 'Network printer configured on this Mac' : 'Connected to this Mac',
      available: !line.includes('disabled'), connectionType: classifyConnection(uri), confidence: 'confirmed',
      isDefault: queueName === defaultQueue };
  });
}

export function parseWindowsPrinters(stdout: string): DeviceInfo[] {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.filter(Boolean).map((printer: any) => ({
    id: `windows:${printer.Name}`,
    name: String(printer.Name || 'Windows Printer'),
    transport: 'windows_raw_spooler',
    queueName: String(printer.Name || ''),
    description: classifyConnection(String(printer.PortName || '')) === 'network' ? 'Network printer configured on this computer' : 'Connected to this computer',
    available: Number(printer.PrinterStatus || 0) !== 7,
    connectionType: classifyConnection(String(printer.PortName || '')),
    confidence: 'confirmed',
    isDefault: Boolean(printer.Default),
  }));
}

export async function discoverSystemPrinters(): Promise<DeviceInfo[]> {
  try {
    if (os.platform() === 'win32') {
      const script = 'Get-Printer | Select-Object Name,PrinterStatus,PortName,Default | ConvertTo-Json -Compress';
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: DISCOVERY_TIMEOUT_MS });
      return parseWindowsPrinters(stdout);
    }
    if (os.platform() === 'darwin') {
      const optionalLpstat = (args: string[]) => execFileAsync('/usr/bin/lpstat', args, { timeout: DISCOVERY_TIMEOUT_MS }).catch(() => ({ stdout: '', stderr: '' }));
      const [printers, devices, defaultPrinter] = await Promise.all([
        optionalLpstat(['-p']), optionalLpstat(['-v']), optionalLpstat(['-d']),
      ]);
      return parseMacPrinters(printers.stdout, devices.stdout, defaultPrinter.stdout);
    }
    return [];
  } catch {
    return [];
  }
}

export function isSafePrivatePrinterHost(host: string): boolean {
  const match = host.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isSafePrinterQueueName(queueName: string): boolean {
  return queueName.length > 0 && queueName.length <= 128 && /^[\p{L}\p{N} _().-]+$/u.test(queueName);
}
