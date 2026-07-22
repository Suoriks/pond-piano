'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, session } = require('electron');
const { closeServer, createStaticServer, listenOnLoopback } = require('./static-server.js');

app.commandLine.appendSwitch('autoplay-policy', 'user-gesture-required');

let mainWindow = null;
let staticServer = null;
let appOrigin = null;
let shutdownStarted = false;

function isShellNavigation(target) {
  try {
    const url = new URL(target);
    return url.origin === appOrigin && (url.pathname === '/' || url.pathname === '/index.html');
  } catch {
    return false;
  }
}

function lockDownSession() {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  appSession.on('will-download', event => event.preventDefault());
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#041313',
    icon: path.join(__dirname, '..', 'assets', 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false,
      navigateOnDragDrop: false,
      spellcheck: false
    }
  });

  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('will-navigate', (event, target) => {
    if (!isShellNavigation(target)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, target) => {
    if (!isShellNavigation(target)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });

  window.loadURL(`${appOrigin}/index.html`).catch(error => {
    console.error('Failed to load the Pond Piano shell:', error);
    app.quit();
  });
  return window;
}

async function start() {
  staticServer = createStaticServer(path.join(__dirname, '..'));
  appOrigin = await listenOnLoopback(staticServer);
  lockDownSession();
  Menu.setApplicationMenu(null);
  mainWindow = createWindow();
}

app.whenReady().then(start).catch(error => {
  console.error('Failed to start Pond Piano:', error);
  app.exit(1);
});

app.on('activate', () => {
  if (!mainWindow && appOrigin && !shutdownStarted) mainWindow = createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', event => {
  if (shutdownStarted || !staticServer?.listening) return;
  event.preventDefault();
  shutdownStarted = true;
  closeServer(staticServer)
    .then(() => app.quit())
    .catch(error => {
      console.error('Failed to stop the local server cleanly:', error);
      app.exit(1);
    });
});
