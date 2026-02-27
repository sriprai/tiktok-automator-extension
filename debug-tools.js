// TikTok Video Automator Chrome Extension
// Debugging Tools for Sync User Issues

console.log("TikTok Automator Debug Tools loaded");

// Debug state
const DEBUG_STATE = {
  enabled: true,
  logLevel: "verbose", // 'verbose', 'info', 'warn', 'error'
  storageKeys: [],
  cookieDomains: [],
  apiEndpoints: [],
  lastSyncAttempt: null,
  syncErrors: [],
};

// Debug logging
function debugLog(level, message, data = null) {
  if (!DEBUG_STATE.enabled) return;

  const levels = ["verbose", "info", "warn", "error"];
  const currentLevelIndex = levels.indexOf(DEBUG_STATE.logLevel);
  const messageLevelIndex = levels.indexOf(level);

  if (messageLevelIndex >= currentLevelIndex) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }

    // Store errors for debugging
    if (level === "error") {
      DEBUG_STATE.syncErrors.push({
        timestamp,
        message,
        data,
      });
    }
  }
}

// Debug UI
function createDebugUI() {
  const debugPanel = document.createElement("div");
  debugPanel.id = "tt-automator-debug-panel";
  debugPanel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 400px;
    max-height: 80vh;
    background: rgba(15, 23, 42, 0.95);
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 16px;
    z-index: 999999;
    color: #f1f5f9;
    font-family: monospace;
    font-size: 12px;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
  `;

  debugPanel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #475569; padding-bottom: 8px;">
      <h3 style="margin: 0; color: #60a5fa; font-size: 14px; font-weight: bold;">
        🐛 TikTok Automator Debug
      </h3>
      <div style="display: flex; gap: 8px;">
        <button id="debug-refresh" style="padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Refresh
        </button>
        <button id="debug-close" style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Close
        </button>
      </div>
    </div>
    
    <div style="margin-bottom: 12px;">
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button id="debug-check-auth" style="flex: 1; padding: 6px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Check Auth
        </button>
        <button id="debug-check-cookies" style="flex: 1; padding: 6px; background: #06b6d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Check Cookies
        </button>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="debug-check-storage" style="flex: 1; padding: 6px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Check Storage
        </button>
        <button id="debug-check-webapp" style="flex: 1; padding: 6px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
          Check Web App
        </button>
      </div>
    </div>
    
    <div id="debug-output" style="background: rgba(30, 41, 59, 0.8); border-radius: 4px; padding: 12px; max-height: 300px; overflow-y: auto; font-size: 11px; line-height: 1.4;">
      <div style="color: #94a3b8; font-style: italic;">
        Click buttons above to run diagnostics...
      </div>
    </div>
    
    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #475569;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #cbd5e1; font-size: 11px;">Log Level:</span>
        <select id="debug-log-level" style="padding: 4px; background: #1e293b; color: #f1f5f9; border: 1px solid #475569; border-radius: 4px; font-size: 11px;">
          <option value="verbose">Verbose</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>
      <button id="debug-clear-logs" style="width: 100%; padding: 6px; background: #64748b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-top: 4px;">
        Clear Logs
      </button>
    </div>
  `;

  document.body.appendChild(debugPanel);

  // Event listeners
  document
    .getElementById("debug-refresh")
    .addEventListener("click", refreshDebugInfo);
  document.getElementById("debug-close").addEventListener("click", () => {
    debugPanel.remove();
  });
  document
    .getElementById("debug-check-auth")
    .addEventListener("click", checkAuthDebug);
  document
    .getElementById("debug-check-cookies")
    .addEventListener("click", checkCookiesDebug);
  document
    .getElementById("debug-check-storage")
    .addEventListener("click", checkStorageDebug);
  document
    .getElementById("debug-check-webapp")
    .addEventListener("click", checkWebAppDebug);
  document
    .getElementById("debug-clear-logs")
    .addEventListener("click", clearDebugLogs);
  document.getElementById("debug-log-level").addEventListener("change", (e) => {
    DEBUG_STATE.logLevel = e.target.value;
    debugLog("info", `Log level changed to: ${DEBUG_STATE.logLevel}`);
  });

  // Set initial log level
  document.getElementById("debug-log-level").value = DEBUG_STATE.logLevel;

  debugLog("info", "Debug UI created");
}

// Update debug output
function updateDebugOutput(content) {
  const outputEl = document.getElementById("debug-output");
  if (outputEl) {
    outputEl.innerHTML = content;
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

// Append to debug output
function appendDebugOutput(content) {
  const outputEl = document.getElementById("debug-output");
  if (outputEl) {
    outputEl.innerHTML += content;
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

// Clear debug logs
function clearDebugLogs() {
  updateDebugOutput(
    '<div style="color: #94a3b8; font-style: italic;">Logs cleared...</div>',
  );
  DEBUG_STATE.syncErrors = [];
  debugLog("info", "Debug logs cleared");
}

// Refresh debug info
function refreshDebugInfo() {
  debugLog("verbose", "Refreshing debug info");

  let output =
    '<div style="color: #60a5fa; margin-bottom: 8px; font-weight: bold;">Debug Info</div>';

  // Extension info
  output += '<div style="margin-bottom: 8px;">';
  output +=
    '<div style="color: #cbd5e1; font-size: 10px; margin-bottom: 4px;">Extension Status:</div>';
  output += `<div style="color: #22c55e; padding-left: 8px;">✓ Debug tools loaded</div>`;
  output += `<div style="color: #22c55e; padding-left: 8px;">✓ Chrome APIs available: ${typeof chrome !== "undefined"}</div>`;
  output += `<div style="color: #22c55e; padding-left: 8px;">✓ Runtime ID: ${chrome.runtime?.id || "N/A"}</div>`;
  output += "</div>";

  // Page info
  output += '<div style="margin-bottom: 8px;">';
  output +=
    '<div style="color: #cbd5e1; font-size: 10px; margin-bottom: 4px;">Page Info:</div>';
  output += `<div style="padding-left: 8px;">URL: ${window.location.href}</div>`;
  output += `<div style="padding-left: 8px;">Title: ${document.title}</div>`;
  output += "</div>";

  // Sync status
  output += '<div style="margin-bottom: 8px;">';
  output +=
    '<div style="color: #cbd5e1; font-size: 10px; margin-bottom: 4px;">Sync Status:</div>';
  output += `<div style="padding-left: 8px;">Last sync attempt: ${DEBUG_STATE.lastSyncAttempt || "Never"}</div>`;
  output += `<div style="padding-left: 8px;">Sync errors: ${DEBUG_STATE.syncErrors.length}</div>`;
  output += "</div>";

  updateDebugOutput(output);
}

// Check auth debug
async function checkAuthDebug() {
  debugLog("info", "Running auth check debug...");

  let output =
    '<div style="color: #60a5fa; margin-bottom: 8px; font-weight: bold;">Auth Check Debug</div>';
  appendDebugOutput(output);

  // Check if we're in popup context
  if (window.location.href.includes("popup.html")) {
    output =
      '<div style="color: #f59e0b; margin-bottom: 8px;">Running in popup context...</div>';
    appendDebugOutput(output);

    // Try to access popup functions
    if (typeof window.TikTokAutomatorExtension !== "undefined") {
      try {
        const result = await window.TikTokAutomatorExtension.checkAuth(true);
        output = `<div style="color: #22c55e; margin-bottom: 8px;">Auth check result: ${result}</div>`;
        appendDebugOutput(output);

        const user = window.TikTokAutomatorExtension.getCurrentUser();
        if (user) {
          output = `<div style="color: #22c55e; margin-bottom: 8px;">Current user: ${user.email || user.id || "Unknown"}</div>`;
          appendDebugOutput(output);
        } else {
          output =
            '<div style="color: #ef4444; margin-bottom: 8px;">No user found</div>';
          appendDebugOutput(output);
        }
      } catch (error) {
        output = `<div style="color: #ef4444; margin-bottom: 8px;">Auth check error: ${error.message}</div>`;
        appendDebugOutput(output);
      }
    } else {
      output =
        '<div style="color: #ef4444; margin-bottom: 8px;">Popup functions not available</div>';
      appendDebugOutput(output);
    }
  } else {
    output =
      '<div style="color: #f59e0b; margin-bottom: 8px;">Not in popup context</div>';
    appendDebugOutput(output);
  }
}

// Check cookies debug
async function checkCookiesDebug() {
  debugLog("info", "Running cookies check debug...");

  let output =
    '<div style="color: #60a5fa; margin-bottom: 8px; font-weight: bold;">Cookies Check Debug</div>';
  appendDebugOutput(output);

  if (typeof chrome === "undefined" || !chrome.cookies) {
    output =
      '<div style="color: #ef4444; margin-bottom: 8px;">Chrome cookies API not available</div>';
    appendDebugOutput(output);
    return;
  }

  // Check cookies for different domains
  const domains = [
    "https://automatorx.co",
    "https://www.automatorx.co",
    "http://localhost:3000",
    "https://tiktok-automator.vercel.app",
  ];

  for (const domain of domains) {
    output = `<div style="color: #cbd5e1; margin-bottom: 4px;">Checking cookies for: ${domain}</div>`;
    appendDebugOutput(output);

    try {
      const cookies = await new Promise((resolve) => {
        chrome.cookies.getAll({ url: domain }, resolve);
      });

      if (cookies.length === 0) {
        output =
          '<div style="color: #f59e0b; padding-left: 12px; margin-bottom: 4px;">No cookies found</div>';
        appendDebugOutput(output);
      } else {
        output = `<div style="color: #22c55e; padding-left: 12px; margin-bottom: 4px;">Found ${cookies.length} cookies:</div>`;
        appendDebugOutput(output);

        // Look for auth-related cookies
        const authCookies = cookies.filter(
          (cookie) =>
            cookie.name.includes("session") ||
            cookie.name.includes("auth") ||
            cookie.name.includes("token") ||
            cookie.name.includes("user"),
        );

        if (authCookies.length > 0) {
          authCookies.forEach((cookie) => {
            output = `<div style="padding-left: 24px; margin-bottom: 2px; font-size: 10px;">
              <span style="color: #86efac;">${cookie.name}</span>: 
              <span style="color: #cbd5e1;">${cookie.value.substring(0, 20)}${cookie.value.length > 20 ? "..." : ""}</span>
            </div>`;
            appendDebugOutput(output);
          });
        } else {
          output =
            '<div style="color: #f59e0b; padding-left: 24px; margin-bottom: 4px;">No auth cookies found</div>';
          appendDebugOutput(output);
        }
      }
    } catch (error) {
      output = `<div style="color: #ef4444; padding-left: 12px; margin-bottom: 4px;">Error: ${error.message}</div>`;
      appendDebugOutput(output);
    }
  }
}

// Check storage debug
async function checkStorageDebug() {
  debugLog("info", "Running storage check debug...");

  let output =
    '<div style="color: #60a5fa; margin-bottom: 8px; font-weight: bold;">Storage Check Debug</div>';
  appendDebugOutput(output);

  if (typeof chrome === "undefined" || !chrome.storage) {
    output =
      '<div style="color: #ef4444; margin-bottom: 8px;">Chrome storage API not available</div>';
    appendDebugOutput(output);
    return;
  }

  try {
    // Check local storage
    const localData = await new Promise((resolve) => {
      chrome.storage.local.get(null, resolve);
    });

    output = `<div style="color: #cbd5e1; margin-bottom: 4px;">Local storage items: ${Object.keys(localData).length}</div>`;
    appendDebugOutput(output);

    // Look for user-related data
    const userKeys = Object.keys(localData).filter(
      (key) =>
        key.includes("user") ||
        key.includes("auth") ||
        key.includes("token") ||
        key.includes("tiktok"),
    );

    if (userKeys.length > 0) {
      userKeys.forEach((key) => {
        const value = localData[key];
        let displayValue;

        if (typeof value === "object") {
          if (value.email || value.id) {
            displayValue = `{ email: ${value.email || "N/A"}, id: ${value.id || "N/A"} }`;
          } else {
            displayValue = JSON.stringify(value).substring(0, 50);
            if (JSON.stringify(value).length > 50) displayValue += "...";
          }
        }

        output = `<div style="padding-left: 12px; margin-bottom: 2px; font-size: 10px;">
          <span style="color: #86efac;">${key}</span>: 
          <span style="color: #cbd5e1;">${displayValue}</span>
        </div>`;
        appendDebugOutput(output);
      });
    } else {
      output =
        '<div style="color: #f59e0b; padding-left: 12px; margin-bottom: 4px;">No user data in storage</div>';
      appendDebugOutput(output);
    }
  } catch (error) {
    output = `<div style="color: #ef4444; margin-bottom: 8px;">Storage error: ${error.message}</div>`;
    appendDebugOutput(output);
  }
}

// Check web app debug
async function checkWebAppDebug() {
  debugLog("info", "Running web app check debug...");

  let output =
    '<div style="color: #60a5fa; margin-bottom: 8px; font-weight: bold;">Web App Check Debug</div>';
  appendDebugOutput(output);

  if (typeof chrome === "undefined" || !chrome.tabs) {
    output =
      '<div style="color: #ef4444; margin-bottom: 8px;">Chrome tabs API not available</div>';
    appendDebugOutput(output);
    return;
  }

  // Check for web app tabs
  const webAppUrls = [
    "https://automatorx.co/*",
    "https://www.automatorx.co/*",
    "http://localhost:3000/*",
    "https://tiktok-automator.vercel.app/*",
  ];

  try {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: webAppUrls }, resolve);
    });

    output = `<div style="color: #cbd5e1; margin-bottom: 4px;">Found ${tabs.length} web app tabs</div>`;
    appendDebugOutput(output);

    if (tabs.length === 0) {
      output =
        '<div style="color: #f59e0b; padding-left: 12px; margin-bottom: 4px;">No web app tabs open</div>';
      appendDebugOutput(output);
      return;
    }

    // Try to communicate with each tab
    for (const tab of tabs) {
      output = `<div style="color: #cbd5e1; margin-bottom: 4px;">Checking tab: ${tab.title || tab.url}</div>`;
      appendDebugOutput(output);

      try {
        // Send ping message
        const response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { action: "PING" }, (response) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
            } else {
              resolve(response);
            }
          });
        });

        if (response.error) {
          output = `<div style="color: #ef4444; padding-left: 12px; margin-bottom: 4px;">Ping error: ${response.error}</div>`;
          appendDebugOutput(output);
        } else if (response.success) {
          output = `<div style="color: #22c55e; padding-left: 12px; margin-bottom: 4px;">✓ Ping successful: ${response.message}</div>`;
          appendDebugOutput(output);

          // Try to get user ID
          const userResponse = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              tab.id,
              { action: "GET_USER_ID" },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ error: chrome.runtime.lastError.message });
                } else {
                  resolve(response);
                }
              },
            );
          });

          if (userResponse.error) {
            output = `<div style="color: #f59e0b; padding-left: 24px; margin-bottom: 4px;">User ID error: ${userResponse.error}</div>`;
            appendDebugOutput(output);
          } else if (userResponse.success) {
            output = `<div style="color: #22c55e; padding-left: 24px; margin-bottom: 4px;">✓ User ID found: ${userResponse.userId}</div>`;
            appendDebugOutput(output);
          } else {
            output = `<div style="color: #f59e0b; padding-left: 24px; margin-bottom: 4px;">No user ID response</div>`;
            appendDebugOutput(output);
          }
        } else {
          output = `<div style="color: #f59e0b; padding-left: 12px; margin-bottom: 4px;">No ping response</div>`;
          appendDebugOutput(output);
        }
      } catch (error) {
        output = `<div style="color: #ef4444; padding-left: 12px; margin-bottom: 4px;">Tab error: ${error.message}</div>`;
        appendDebugOutput(output);
      }
    }
  } catch (error) {
    output = `<div style="color: #ef4444; margin-bottom: 8px;">Web app check error: ${error.message}</div>`;
    appendDebugOutput(output);
  }
}

// Initialize debug tools
function initDebugTools() {
  debugLog("info", "Initializing debug tools");

  // Create debug UI if we're in popup or web app
  if (
    window.location.href.includes("popup.html") ||
    window.location.href.includes("automatorx.co") ||
    window.location.href.includes("localhost:3000") ||
    window.location.href.includes("tiktok-automator.vercel.app")
  ) {
    // Add debug button to page
    const debugButton = document.createElement("button");
    debugButton.id = "tt-automator-debug-btn";
    debugButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      z-index: 999998;
      font-size: 20px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    debugButton.textContent = "🐛";
    debugButton.title = "Open TikTok Automator Debug Tools";

    debugButton.addEventListener("click", () => {
      if (!document.getElementById("tt-automator-debug-panel")) {
        createDebugUI();
        refreshDebugInfo();
      }
    });

    document.body.appendChild(debugButton);

    // Auto-open debug panel in popup for easier debugging
    if (window.location.href.includes("popup.html")) {
      setTimeout(() => {
        if (!document.getElementById("tt-automator-debug-panel")) {
          createDebugUI();
          refreshDebugInfo();
        }
      }, 1000);
    }
  }
}

// Export for use in other scripts
window.TikTokAutomatorDebug = {
  debugLog,
  initDebugTools,
  checkAuthDebug,
  checkCookiesDebug,
  checkStorageDebug,
  checkWebAppDebug,
  refreshDebugInfo,
  DEBUG_STATE,
};

// Auto-initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDebugTools);
} else {
  initDebugTools();
}

debugLog("info", "Debug tools initialized successfully");
