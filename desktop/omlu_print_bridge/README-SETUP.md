# OMLU Print Bridge (Developer / Hardware Test Package)

> [!IMPORTANT]
> This archive is a **Developer / Hardware Test Package** for local environment testing. It is NOT a standalone customer installer.

## Prerequisites
- **Target OS**: Windows 10 or Windows 11
- **Node.js Runtime**: Node.js v18.0.0 or higher must be installed on the PC.

## Installation Steps
1. Extract `omlu-print-bridge-developer-package.zip` into a directory (e.g. `C:\OMLUPrintBridge`).
2. Open Command Prompt or PowerShell in the extracted directory.
3. Install production dependencies:
   ```cmd
   npm install --omit=dev
   ```
4. Start the Print Bridge:
   ```cmd
   start-bridge.bat
   ```
   or:
   ```cmd
   npm start
   ```

## Local API
The Print Bridge will listen locally on `http://127.0.0.1:24242`.
Health endpoint: `http://127.0.0.1:24242/v1/health`.
