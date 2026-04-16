import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { BrowserWindow, WebContentsView } from "electron";
import type { WebContents } from "electron";

interface TabInfo {
  id: string;
  view: WebContentsView;
  url: string;
  title: string;
}

/**
 * TabManager — Manages multiple browser tabs as WebContentsView instances.
 * Each tab gets its own WebContentsView, only the active tab is displayed.
 * Popup windows (window.open) are intercepted and opened as new tabs.
 */
export class TabManager extends EventEmitter {
  private tabs = new Map<string, TabInfo>();
  private activeTabId: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private boundsCalculator: (() => Electron.Rectangle) | null = null;
  /** Track destroyed tabs to avoid double-close */
  private destroyedTabs = new Set<string>();
  /** True when app is quitting: no tab recreation/new tabs allowed */
  private isShuttingDown = false;

  /**
   * Initialize with the main window and a bounds calculator callback.
   */
  init(
    mainWindow: BrowserWindow,
    boundsCalculator: () => Electron.Rectangle,
  ): void {
    this.mainWindow = mainWindow;
    this.boundsCalculator = boundsCalculator;
  }

  /**
   * Create a new tab. Optionally navigate to a URL.
   * The new tab becomes the active tab.
   */
  createTab(url?: string): TabInfo {
    if (!this.mainWindow) throw new Error("TabManager not initialized");

    const id = uuidv4();
    const view = new WebContentsView({
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const tab: TabInfo = { id, view, url: url || "", title: "New Tab" };
    this.tabs.set(id, tab);
    this.setupTabListeners(tab);
    this.activateTab(id);

    if (url) {
      view.webContents.loadURL(url).catch(() => {
        // Navigation might fail for invalid URLs
      });
    }

    this.emit("tab-created", { id: tab.id, url: tab.url, title: tab.title });
    return tab;
  }

  /**
   * Close a tab. Prevents closing the last remaining tab.
   */
  closeTab(tabId: string): void {
    if (this.tabs.size <= 1) return; // Keep at least one tab
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Remove from display
    if (this.mainWindow) {
      try {
        this.mainWindow.contentView.removeChildView(tab.view);
      } catch {
        /* already removed */
      }
    }

    // If closing the active tab, activate another one
    if (this.activeTabId === tabId) {
      const tabIds = Array.from(this.tabs.keys());
      const idx = tabIds.indexOf(tabId);
      const nextId = tabIds[idx + 1] || tabIds[idx - 1];
      if (nextId) {
        this.activateTab(nextId);
      }
    }

    this.tabs.delete(tabId);
    this.destroyedTabs.add(tabId);

    // Destroy the WebContentsView
    try {
      tab.view.webContents.close();
    } catch {
      /* already destroyed */
    }

    this.emit("tab-closed", { tabId });
  }

  /**
   * Switch the active tab. Removes the old tab's view and shows the new one.
   */
  activateTab(tabId: string): void {
    if (!this.mainWindow) return;
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Remove the current active tab's view
    if (this.activeTabId && this.activeTabId !== tabId) {
      const oldTab = this.tabs.get(this.activeTabId);
      if (oldTab) {
        try {
          this.mainWindow.contentView.removeChildView(oldTab.view);
        } catch {
          /* not in view */
        }
      }
    }

    // Add the new tab's view
    this.mainWindow.contentView.addChildView(tab.view);
    this.activeTabId = tabId;

    // Apply bounds
    if (this.boundsCalculator) {
      tab.view.setBounds(this.boundsCalculator());
    }

    this.emit("tab-activated", { tabId, url: tab.url, title: tab.title });
  }

  /**
   * Update bounds on the active tab (e.g., on window resize).
   */
  updateBounds(): void {
    if (!this.activeTabId || !this.boundsCalculator) return;
    const tab = this.tabs.get(this.activeTabId);
    if (tab) {
      tab.view.setBounds(this.boundsCalculator());
    }
  }

  getActiveTab(): TabInfo | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  getActiveWebContents(): WebContents | null {
    return this.getActiveTab()?.view.webContents || null;
  }

  getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values());
  }

  /** Mark manager as shutting down (disables tab auto-recreation paths). */
  setShuttingDown(shuttingDown: boolean): void {
    this.isShuttingDown = shuttingDown;
  }

  /**
   * Destroy all tabs and clean up.
   */
  destroyAllTabs(): void {
    for (const [tabId, tab] of this.tabs) {
      if (this.mainWindow) {
        try {
          this.mainWindow.contentView.removeChildView(tab.view);
        } catch {
          /* ignore */
        }
      }
      try {
        tab.view.webContents.close();
      } catch {
        /* ignore */
      }
      this.destroyedTabs.add(tabId);
    }
    this.tabs.clear();
    this.activeTabId = null;
  }

  /**
   * Set up event listeners on a tab's WebContents.
   */
  private setupTabListeners(tab: TabInfo): void {
    const wc = tab.view.webContents;

    // Prevent page scripts from closing the window via window.close()
    // This avoids crashes when the WebContentsView is destroyed unexpectedly.
    wc.on("will-prevent-unload", (event) => {
      // Always prevent the close — do not show the "Leave site?" dialog
      event.preventDefault();
    });

    // Override window.close() in page context to make it a no-op
    wc.on("did-finish-load", () => {
      wc.executeJavaScript("window.close = function() {};").catch(() => {});
    });
    wc.on("did-navigate-in-page", () => {
      wc.executeJavaScript("window.close = function() {};").catch(() => {});
    });

    // Intercept window.open / target="_blank" — open as new internal tab
    wc.setWindowOpenHandler((details) => {
      // Create a new tab with the popup URL
      this.createTab(details.url);
      return { action: "deny" };
    });

    // Track URL changes
    const onNavigate = (): void => {
      tab.url = wc.getURL();
      this.emit("tab-updated", {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      });
    };
    wc.on("did-navigate", onNavigate);
    wc.on("did-navigate-in-page", onNavigate);

    // Track title changes
    wc.on("page-title-updated", (_event, title) => {
      tab.title = title;
      this.emit("tab-updated", {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      });
    });

    // Handle unexpected WebContents destruction (e.g., window.close()
    // bypassed our safeguards). Clean up gracefully instead of crashing.
    wc.on("destroyed", () => {
      if (this.destroyedTabs.has(tab.id) || !this.tabs.has(tab.id)) return;

      // During app quit, WebContents are expected to be destroyed; do not recreate tabs.
      if (this.isShuttingDown) {
        this.tabs.delete(tab.id);
        this.destroyedTabs.add(tab.id);
        if (this.activeTabId === tab.id) this.activeTabId = null;
        this.emit("tab-closed", { tabId: tab.id });
        return;
      }

      // If this is the last tab, replace it with a new blank tab
      // instead of letting the app crash with no view.
      if (this.tabs.size <= 1) {
        this.tabs.delete(tab.id);
        this.destroyedTabs.add(tab.id);
        this.activeTabId = null;
        // Remove destroyed view from window
        if (this.mainWindow) {
          try {
            this.mainWindow.contentView.removeChildView(tab.view);
          } catch { /* already removed */ }
        }
        // Create a replacement tab
        this.createTab();
        this.emit("tab-closed", { tabId: tab.id });
      } else {
        this.closeTab(tab.id);
      }
    });
  }
}
