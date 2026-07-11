/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Tray,
  Menu,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

// ipc
import './ipcs/index';
// servers
import './server/server-online-map/server';
import serverProcessManager from './server/watchdog/ServerProcessManager';
import autoStartServers from './server/autoStartServers';

process.setMaxListeners(0);

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// 關閉視窗 = 縮到系統匣 (watchdog 需要 GUI 存活);只有明確結束才真的退出
let isQuitting = false;

// ipcMain.on('ipc-example', async (event, arg) => {
//   const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
//   console.log(msgTemplate(arg));
//   event.reply('ipc-example', msgTemplate('pong'));
// });

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1060,
    height: 640,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      zoomFactor: 1.0,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.argv.includes('--hidden')) {
      // 開機自動啟動時留在系統匣,不彈出視窗
      return;
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  // 按下關閉鈕縮到系統匣,讓 watchdog 與伺服器監控繼續運作
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', function (e) {
    mainWindow = null;
  });

  // const menuBuilder = new MenuBuilder(mainWindow);
  // menuBuilder.buildMenu();
  mainWindow.autoHideMenuBar = true;

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

// 訂閱此事件以阻止 Electron 預設的「視窗全關就退出」—
// 系統匣模式下 app 要繼續存活,watchdog 才能運作
app.on('window-all-closed', () => {
  // 留在系統匣
});

// 結束前停掉 watchdog 計時器,避免退出過程中觸發重啟;
// 伺服器程序刻意不殺 — 關閉 GUI 不代表要關伺服器
app.on('before-quit', () => {
  isQuitting = true;
  serverProcessManager.dispose();
});

const showMainWindow = () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
};

const createTray = () => {
  if (tray) return;
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  tray = new Tray(path.join(RESOURCES_PATH, 'icon.png'));
  tray.setToolTip('palserver-GUI');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '開啟主視窗 (Open)',
        click: showMainWindow,
      },
      { type: 'separator' },
      {
        label: '結束 (Exit)',
        click: () => {
          app.quit();
        },
      },
    ]),
  );
  tray.on('double-click', showMainWindow);
};

app
  .whenReady()
  .then(() => {
    createWindow();
    createTray();
    // 稍等主視窗載入後再自動開服,DONE 廣播才收得到;
    // 就算視窗還沒好,renderer 掛載時也會經由 get-running-servers 補同步
    setTimeout(() => {
      autoStartServers().catch(console.log);
    }, 3000);
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

// 開機自動啟動 (Windows 登入時以系統匣模式啟動)
ipcMain.handle('get-login-item', () => {
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('set-login-item', (event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    args: ['--hidden'],
  });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('selectDir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled) {
    return;
  }
  return filePaths[0];
});
