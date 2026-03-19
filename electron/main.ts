import { app, BrowserWindow, shell, utilityProcess, ipcMain } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';

let mainWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let serverProcess: Electron.UtilityProcess | null = null;
let mem0Process: Electron.UtilityProcess | null = null;
let memoryEngineProcess: ChildProcessWithoutNullStreams | null = null;

const isDev = process.env.NODE_ENV === 'development';
const WEB_PORT = process.env.WEB_PORT || '3000';
const MEM0_PORT = process.env.MEM0_SERVICE_PORT || '3010';
const MEMORY_ENGINE_PORT = process.env.MEMORY_ENGINE_PORT || '8000';

function waitForServer(url: string, retries = 60, interval = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else if (++attempts < retries) {
            setTimeout(check, interval);
          } else {
            reject(new Error('Server did not start'));
          }
        })
        .on('error', () => {
          if (++attempts < retries) {
            setTimeout(check, interval);
          } else {
            reject(new Error('Server did not start'));
          }
        });
    };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#ffffff',
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  const serverUrl = `http://127.0.0.1:${WEB_PORT}`;

  if (isDev) {
    await waitForServer(serverUrl).catch(() => {});
    mainWindow.loadURL(serverUrl);
  } else {
    startMem0Service();
    await waitForServer(`http://127.0.0.1:${MEM0_PORT}/health`).catch(() => {
      console.error('Failed to start Mem0 service');
    });
    await ensureMemoryEngineAvailable();
    startNextServer();
    await waitForServer(serverUrl).catch(() => {
      console.error('Failed to start Next.js server');
    });
    mainWindow.loadURL(serverUrl);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getMemoryDbPath() {
  return path.join(app.getPath('userData'), 'memory.db');
}

function getGraphitiDbPath() {
  return path.join(app.getPath('userData'), 'graphiti', 'graphiti.kuzu');
}

function getKnowledgeStatePath() {
  return path.join(app.getPath('userData'), 'graphiti', 'knowledge-state');
}

function getBundledMastersPath() {
  return path.join(process.resourcesPath!, 'memory-engine', 'masters');
}

function getBundledMemoryEngineExecutable() {
  const executableName =
    process.platform === 'win32'
      ? 'open-master-memory-engine.exe'
      : 'open-master-memory-engine';

  return path.join(
    process.resourcesPath!,
    'memory-engine',
    'open-master-memory-engine',
    executableName
  );
}

function startMem0Service() {
  const servicePath = path.join(
    process.resourcesPath!,
    'mem0-service',
    'server.cjs'
  );

  try {
    mem0Process = utilityProcess.fork(servicePath, [], {
      env: {
        ...process.env,
        MEMORY_DB_PATH: getMemoryDbPath(),
        MEM0_SERVICE_PORT: MEM0_PORT,
      },
      stdio: 'pipe',
    });

    mem0Process.stdout?.on('data', (data: Buffer) => {
      console.log(`[mem0] ${data.toString()}`);
    });

    mem0Process.stderr?.on('data', (data: Buffer) => {
      console.error(`[mem0] ${data.toString()}`);
    });

    mem0Process.on('exit', (code) => {
      console.log(`[mem0] service exited with code ${code}`);
      mem0Process = null;
    });
  } catch (err) {
    console.error('[mem0] Failed to start service:', err);
  }
}

function startNextServer() {
  const serverPath = path.join(process.resourcesPath!, 'standalone', 'server.js');

  try {
    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: WEB_PORT,
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        MEMORY_DB_PATH: getMemoryDbPath(),
        MEM0_SERVICE_URL: `http://127.0.0.1:${MEM0_PORT}`,
        MEMORY_ENGINE_URL: `http://127.0.0.1:${MEMORY_ENGINE_PORT}`,
      },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[next] ${data.toString()}`);
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[next] ${data.toString()}`);
    });

    serverProcess.on('exit', (code) => {
      console.log(`[next] server exited with code ${code}`);
      serverProcess = null;
    });
  } catch (err) {
    console.error('[next] Failed to start server:', err);
  }
}

function startBundledMemoryEngine() {
  const executablePath = getBundledMemoryEngineExecutable();
  if (!fs.existsSync(executablePath)) {
    console.error('[graphiti] Bundled memory-engine executable not found:', executablePath);
    return;
  }

  const graphitiDir = path.dirname(getGraphitiDbPath());
  fs.mkdirSync(graphitiDir, { recursive: true });
  fs.mkdirSync(getKnowledgeStatePath(), { recursive: true });

  try {
    memoryEngineProcess = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      env: {
        ...process.env,
        MEMORY_ENGINE_PORT,
        KUZU_DB_PATH: getGraphitiDbPath(),
        KNOWLEDGE_STATE_DIR: getKnowledgeStatePath(),
        MASTERS_DIR: getBundledMastersPath(),
        PYTHONUNBUFFERED: '1',
      },
      stdio: 'pipe',
    });

    memoryEngineProcess.stdout.on('data', (data: Buffer) => {
      console.log(`[graphiti] ${data.toString()}`);
    });

    memoryEngineProcess.stderr.on('data', (data: Buffer) => {
      console.error(`[graphiti] ${data.toString()}`);
    });

    memoryEngineProcess.on('exit', (code) => {
      console.log(`[graphiti] service exited with code ${code}`);
      memoryEngineProcess = null;
    });
  } catch (err) {
    console.error('[graphiti] Failed to start bundled memory-engine:', err);
  }
}

async function ensureMemoryEngineAvailable() {
  const healthUrl = `http://127.0.0.1:${MEMORY_ENGINE_PORT}/health`;
  startBundledMemoryEngine();
  await waitForServer(healthUrl).catch(() => {
    console.error('Failed to start bundled memory-engine');
  });
}

// ── OpenClaw 管理面板（独立悬浮窗口）────────────────────────────────────────
ipcMain.handle('openclaw:open-panel', () => {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.center();
    panelWindow.focus();
    return;
  }

  panelWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    title: 'OpenClaw 管理',
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  panelWindow.loadURL(`http://127.0.0.1:${WEB_PORT}/openclaw-panel`);

  panelWindow.on('closed', () => {
    panelWindow = null;
  });
});

ipcMain.handle('openclaw:close-panel', () => {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.close();
    panelWindow = null;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (mem0Process) {
    mem0Process.kill();
    mem0Process = null;
  }
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (memoryEngineProcess) {
    memoryEngineProcess.kill();
    memoryEngineProcess = null;
  }
});
