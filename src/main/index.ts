import { app, BrowserWindow } from "electron";
import { getDatabase, closeDatabase } from "./db/database";
import { runMigrations } from "./db/migrations";
import {
  SessionsRepo,
  RequestsRepo,
  JsHooksRepo,
  StorageSnapshotsRepo,
  AnalysisReportsRepo,
} from "./db/repositories";
import { CaptureEngine } from "./capture/capture-engine";
import { SessionManager } from "./session/session-manager";
import { AiAnalyzer } from "./ai/ai-analyzer";
import { WindowManager } from "./window";
import { registerIpcHandlers, loadProxyConfig, applyProxy, loadMCPServerConfig } from "./ipc";
import { Updater } from "./updater";
import { MCPClientManager } from "./mcp/mcp-manager";
import { initMCPServer, stopMCPServer } from "./mcp/mcp-server";
import { CaManager } from "./proxy/ca-manager";
import { MitmProxyServer } from "./proxy/mitm-proxy-server";
import { loadMitmProxyConfig, saveMitmProxyConfig } from "./proxy/mitm-proxy-config";
import { SystemProxy } from "./proxy/system-proxy";
import { join } from "path";

const windowManager = new WindowManager();
const mcpManager = new MCPClientManager();
let sessionManagerRef: SessionManager | null = null;
let quitInProgress = false;

// MITM Proxy — initialized once, shared across the app lifetime
const caManager = new CaManager(join(app.getPath("userData"), "mitm-ca"));
const mitmProxy = new MitmProxyServer(caManager);

app.whenReady().then(async () => {
  // Initialize database
  const db = getDatabase();
  runMigrations(db);

  // Initialize repositories
  const sessionsRepo = new SessionsRepo(db);
  const requestsRepo = new RequestsRepo(db);
  const jsHooksRepo = new JsHooksRepo(db);
  const storageSnapshotsRepo = new StorageSnapshotsRepo(db);
  const reportsRepo = new AnalysisReportsRepo(db);

  // Initialize capture engine
  const captureEngine = new CaptureEngine(
    requestsRepo,
    jsHooksRepo,
    storageSnapshotsRepo,
  );

  // Initialize session manager
  const sessionManager = new SessionManager(sessionsRepo, captureEngine);
  sessionManagerRef = sessionManager;

  // Recover from potential crash
  sessionManager.recoverFromCrash();

  // Initialize AI analyzer
  const aiAnalyzer = new AiAnalyzer(
    sessionsRepo,
    requestsRepo,
    jsHooksRepo,
    storageSnapshotsRepo,
    reportsRepo,
  );

  // Create main window
  windowManager.createMainWindow();

  // Initialize tab manager with first tab
  windowManager.initTabs();

  // Apply proxy config from saved settings (before IPC handlers)
  const proxyConfig = loadProxyConfig();
  if (proxyConfig && proxyConfig.type !== "none") {
    applyProxy(proxyConfig).catch((err) =>
      console.error("Failed to apply proxy config:", err),
    );
  }

  // Initialize auto-updater
  const updater = new Updater();
  const mainWin = windowManager.getMainWindow();
  if (mainWin) updater.setMainWindow(mainWin);

  // Inject MCP client manager into AI analyzer
  aiAnalyzer.setMCPManager(mcpManager);

  // Register IPC handlers
  registerIpcHandlers({
    sessionManager,
    aiAnalyzer,
    windowManager,
    updater,
    mcpManager,
    mitmProxy,
    caManager,
    sessionsRepo,
    requestsRepo,
    jsHooksRepo,
    storageSnapshotsRepo,
    reportsRepo,
  });

  // Check for updates on startup (non-blocking, delayed 3s)
  setTimeout(() => updater.checkForUpdates(), 3000);

  // Start MCP Server if enabled
  const mcpServerConfig = loadMCPServerConfig();
  if (mcpServerConfig.enabled) {
    initMCPServer(
      { sessionManager, aiAnalyzer, windowManager, requestsRepo, jsHooksRepo, storageSnapshotsRepo, reportsRepo },
      mcpServerConfig.port,
    ).catch((err) => console.error("Failed to start MCP Server:", err));
  }

  // Initialize MITM Proxy
  const mitmConfig = loadMitmProxyConfig();

  // Wire proxy captured events → CaptureEngine (same data shape as CDP)
  mitmProxy.on("response-captured", (data) => {
    captureEngine.handleResponseCaptured({ ...data, source: "proxy" });
  });

  if (mitmConfig.enabled) {
    caManager
      .init()
      .then(() => mitmProxy.start(mitmConfig.port))
      .then(() => {
        console.log("[Main] MITM proxy auto-started on port", mitmConfig.port);
        if (mitmConfig.systemProxy) {
          SystemProxy.enable(mitmConfig.port).catch((err) =>
            console.error("[Main] Failed to enable system proxy:", err),
          );
        }
      })
      .catch((err) => console.error("[Main] Failed to auto-start MITM proxy:", err));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
      windowManager.initTabs();
      const win = windowManager.getMainWindow();
      if (win) updater.setMainWindow(win);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitInProgress) return;

  // Block immediate quit and perform ordered async cleanup first.
  event.preventDefault();
  quitInProgress = true;

  (async () => {
    try {
      // Mark shutdown state early so tab destroy handlers don't recreate tabs.
      windowManager.setShuttingDown(true);

      // 1) Stop capture pipelines first, so no new DB writes are produced.
      const currentSessionId = sessionManagerRef?.getCurrentSessionId();
      if (sessionManagerRef && currentSessionId) {
        await sessionManagerRef.stopCapture(currentSessionId);
      }

      // 2) Disable system proxy and persist state.
      await SystemProxy.disable().catch(() => {});
      const config = loadMitmProxyConfig();
      if (config.systemProxy) {
        saveMitmProxyConfig({ ...config, systemProxy: false });
      }

      // 3) Stop async services.
      await mitmProxy.stop().catch(() => {});
      await stopMCPServer().catch(() => {});
      await mcpManager.disconnectAll().catch(() => {});
    } finally {
      // 4) Close DB last, then let Electron finish normal quit flow.
      closeDatabase();
      app.quit();
    }
  })().catch(() => {
    // Ignore and still force-exit via finally block above.
  });
});
