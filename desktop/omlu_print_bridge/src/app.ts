import { app, Tray, Menu, shell, nativeImage, Notification, NativeImage } from 'electron';
import * as path from 'path';
import { PrintBridgeServer } from './server';

const PORT = 24242;
let server: PrintBridgeServer | null = null;
let tray: Tray | null = null;

// Ensure single instance lock so multiple bridge instances don't fight over port 24242
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus or notify when a second instance is launched
  });

  app.whenReady().then(async () => {
    // Hide dock icon on macOS for clean menu-bar-only background mode
    if (process.platform === 'darwin' && app.dock) {
      try {
        app.dock.hide();
      } catch {}
    }

    // Start background PrintBridgeServer
    try {
      server = new PrintBridgeServer();
      await server.listen(PORT, '0.0.0.0');
      console.log(`OMLU Printer Bridge running on http://127.0.0.1:${PORT}`);
    } catch (err) {
      console.error('Failed to start PrintBridgeServer:', err);
    }

    // Default auto-start setting for production restaurant PCs
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
      });
    } catch {}

    // Setup Tray / Menu Bar UI
    setupTray();
  });
}

function setupTray() {
  const iconFileName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'assets', iconFileName);

  let trayIcon: NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createFallbackIcon();
    }
  } catch {
    trayIcon = createFallbackIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('OMLU Printer Bridge');

  updateTrayMenu();
}

function createFallbackIcon(): NativeImage {
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVR42mNkYPj/n4ECwERg1ICRAUYNGBVgZIBR' +
    'A0YGGDVgZIBRg0EG/AcA5WwRk8x6Y5UAAAAASUVORK5CYII=',
    'base64'
  );
  return nativeImage.createFromBuffer(buffer);
}

function updateTrayMenu() {
  if (!tray) return;

  const isAutoStart = app.getLoginItemSettings().openAtLogin;

  const menuTemplate: Array<Electron.MenuItemConstructorOptions> = [
    { label: 'OMLU Printer Bridge v1.0.0', enabled: false },
    { label: '● Connected to OMLU', enabled: false },
    { type: 'separator' },
    {
      label: 'Open OMLU Printing Dashboard',
      click: () => {
        shell.openExternal('http://localhost:3000/admin/printing');
      },
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: isAutoStart,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Restart Bridge',
      click: () => {
        void (async () => {
          if (server) {
            try {
              await server.stop();
            } catch {}
          }
          server = new PrintBridgeServer();
          await server.listen(PORT, '0.0.0.0');
          if (Notification.isSupported()) {
            new Notification({ title: 'OMLU Printer Bridge', body: 'Bridge restarted successfully.' }).show();
          }
        })();
      },
    },
    {
      label: 'Quit OMLU Printer Bridge',
      click: () => {
        void (async () => {
          if (server) {
            try {
              await server.stop();
            } catch {}
          }
          app.quit();
        })();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}
