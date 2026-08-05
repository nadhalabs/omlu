import { PrinterTransport, DeviceInfo, TransportCapabilities } from './transport';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WindowsRawSpoolerTransport implements PrinterTransport {
  public transportName = 'windows_raw_spooler';
  private queueName: string;
  private isConnected: boolean = false;
  private buffer: Buffer[] = [];

  constructor(queueName: string = 'POS58') {
    this.queueName = queueName;
  }

  public async discover(): Promise<DeviceInfo[]> {
    return this.listAvailable();
  }

  public async listAvailable(): Promise<DeviceInfo[]> {
    if (os.platform() !== 'win32') {
      return [{
        id: this.queueName,
        name: `${this.queueName} (Simulated WinSpool RAW)`,
        transport: this.transportName,
        description: 'Simulated Windows Spooler Queue for non-Windows dev testing',
        available: true,
      }];
    }

    try {
      // Use PowerShell ONLY for enumerating installed printer queues
      const { stdout } = await execAsync('powershell -Command "Get-Printer | Select-Name,PrinterStatus,PortName | ConvertTo-Json"');
      const parsed = JSON.parse(stdout);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items.map((p: any) => ({
        id: p.Name,
        name: p.Name,
        transport: this.transportName,
        description: `Port: ${p.PortName || 'N/A'}, Status: ${p.PrinterStatus || 'Unknown'}`,
        available: true,
      }));
    } catch {
      return [{
        id: this.queueName,
        name: this.queueName,
        transport: this.transportName,
        description: 'Windows Printer Queue',
        available: true,
      }];
    }
  }

  public async connect(): Promise<void> {
    this.isConnected = true;
    this.buffer = [];
  }

  public async write(data: Buffer): Promise<void> {
    if (!this.isConnected) throw new Error('Spooler transport not connected.');
    this.buffer.push(data);
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const combined = Buffer.concat(this.buffer);
    this.buffer = [];

    if (os.platform() !== 'win32') {
      throw new Error('WINDOWS_SPOOLER_ONLY_SUPPORTED_ON_WIN32: Windows RAW printer spooler is only supported on Windows operating systems.');
    }

    // Windows execution: Native Win32 WinSpool raw printer invocation
    // Create temporary binary file and submit via C# / Win32 OpenPrinter/WritePrinter script wrapper
    const tempFile = path.join(os.tmpdir(), `omlu_raw_spool_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tempFile, combined);

      const winSpoolScript = `
        $code = @"
        using System;
        using System.IO;
        using System.Runtime.InteropServices;

        public class RawPrinter {
            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public class DOCINFOEX {
                [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
                [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
                [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
            }

            [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

            [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool ClosePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOEX di);

            [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool EndDocPrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool StartPagePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool EndPagePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

            public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
                FileStream fs = new FileStream(szFileName, FileMode.Open, FileAccess.Read);
                BinaryReader br = new BinaryReader(fs);
                Byte[] bytes = new Byte[fs.Length];
                IntPtr pUnmanagedBytes = new IntPtr(0);
                int dwCount = Convert.ToInt32(fs.Length);
                bytes = br.ReadBytes(dwCount);
                fs.Close();

                pUnmanagedBytes = Marshal.AllocCoTaskMem(dwCount);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, dwCount);

                IntPtr hPrinter = new IntPtr(0);
                DOCINFOEX di = new DOCINFOEX();
                di.pDocName = "OMLU Thermal Print Job";
                di.pDatatype = "RAW";

                bool success = false;
                try {
                    if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
                        if (StartDocPrinter(hPrinter, 1, di)) {
                            if (StartPagePrinter(hPrinter)) {
                                int dwWritten = 0;
                                success = WritePrinter(hPrinter, pUnmanagedBytes, dwCount, out dwWritten);
                                EndPagePrinter(hPrinter);
                            }
                            EndDocPrinter(hPrinter);
                        }
                    }
                } finally {
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    if (hPrinter != IntPtr.Zero) {
                        ClosePrinter(hPrinter);
                    }
                }
                return success;
            }
        }
"@
        Add-Type -TypeDefinition $code
        [RawPrinter]::SendFileToPrinter("${this.queueName}", "${tempFile.replace(/\\/g, '\\\\')}")
      `;

      await execAsync(`powershell -Command "${winSpoolScript.replace(/\n/g, ' ')}"`);
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.buffer = [];
  }

  public async testConnection(): Promise<boolean> {
    const list = await this.listAvailable();
    return list.some(p => p.id === this.queueName);
  }

  public capabilities(): TransportCapabilities {
    return {
      transport: this.transportName,
      available: true,
      rawModeSupported: true,
      driverModeSupported: false,
      maxChunkSize: 4096,
    };
  }
}
