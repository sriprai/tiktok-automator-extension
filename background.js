// TikTok Video Automator Chrome Extension
// Background service worker

// Extension ID for communication with web app
const EXTENSION_ID = chrome.runtime.id;

// Persistent window ID
let persistentWindowId = null;

// Listen for messages from web app and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  // Handle persistent window requests
  if (message.action === "OPEN_PERSISTENT_WINDOW") {
    openPersistentWindow();
    sendResponse({ success: true, message: "Opening persistent window" });
    return true;
  }

  if (message.action === "CLOSE_PERSISTENT_WINDOW") {
    closePersistentWindow();
    sendResponse({ success: true, message: "Closing persistent window" });
    return true;
  }

  // Handle extension ID requests from web app
  if (message.action === "EXTENSION_ID_REQUEST") {
    sendResponse({
      success: true,
      extensionId: EXTENSION_ID,
      source: "tiktok_automator_extension",
      version: "1.0.0",
    });
    return true;
  }

  // Handle ping requests
  if (message.action === "PING") {
    sendResponse({
      success: true,
      message: "Extension is alive",
      timestamp: Date.now(),
    });
    return true;
  }

  // Handle video posting requests
  if (message.action === "POST_VIDEO") {
    handlePostVideo(message.data, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Handle TikTok cookie setting
  if (message.action === "SET_TIKTOK_COOKIES") {
    handleSetCookies(message.data, sendResponse);
    return true;
  }

  // Handle user login notifications
  if (message.action === "USER_LOGGED_IN") {
    // Notify all extension parts about login
    chrome.runtime.sendMessage({
      action: "USER_LOGGED_IN",
      user: message.user,
    });
    sendResponse({ success: true });
    return true;
  }

  // Handle API fetch requests from popup (to avoid CORS issues)
  if (message.action === "FETCH_API") {
    handleFetchApi(message.url, message.options, sendResponse);
    return true; // Keep message channel open for async response
  }

  // Default response for unknown actions
  sendResponse({
    success: false,
    error: "Unknown action",
    receivedAction: message.action,
  });
});

// Handle video posting to TikTok
async function handlePostVideo(data, sendResponse) {
  try {
    console.log("Posting video to TikTok:", data);

    // Validate required data
    if (!data.videoUrl || !data.caption || !data.cookies) {
      sendResponse({
        success: false,
        error: "Missing required data: videoUrl, caption, or cookies",
      });
      return;
    }

    // Open TikTok upload page (regular upload page)
    // Note: We use the base URL without query parameters
    const tab = await chrome.tabs.create({
      url: "https://www.tiktok.com/upload",
      active: true,
    });

    // Wait for tab to load
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        // Inject content script to handle upload
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ["content.js"],
          },
          () => {
            // Send data to content script
            chrome.tabs.sendMessage(
              tab.id,
              {
                action: "UPLOAD_VIDEO",
                data: data,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  const errorMsg =
                    chrome.runtime.lastError.message || "Unknown error";
                  console.error(
                    "Error sending message to content script:",
                    errorMsg,
                  );
                  sendResponse({
                    success: false,
                    error: `Failed to communicate with TikTok page: ${errorMsg}`,
                  });
                } else {
                  // Ensure response is a plain object
                  const finalResponse =
                    response && typeof response === "object"
                      ? response
                      : {
                          success: false,
                          error: "Invalid response from content script",
                        };

                  sendResponse(finalResponse);
                }
              },
            );
          },
        );
      }
    });
  } catch (error) {
    console.error("Error in handlePostVideo:", error);
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

// Handle setting TikTok cookies
async function handleSetCookies(data, sendResponse) {
  try {
    console.log("Setting TikTok cookies:", data);

    if (!data.cookies || !Array.isArray(data.cookies)) {
      sendResponse({
        success: false,
        error: "Invalid cookies data",
      });
      return;
    }

    // Set cookies for TikTok domain
    const results = [];
    for (const cookie of data.cookies) {
      try {
        await chrome.cookies.set({
          url: "https://www.tiktok.com",
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || ".tiktok.com",
          path: cookie.path || "/",
          secure: cookie.secure !== false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || "lax",
          expirationDate: cookie.expirationDate,
        });
        results.push({ name: cookie.name, success: true });
      } catch (cookieError) {
        console.error(`Failed to set cookie ${cookie.name}:`, cookieError);
        results.push({
          name: cookie.name,
          success: false,
          error: cookieError.message,
        });
      }
    }

    // Check if we successfully set session cookies
    const hasSessionCookie = data.cookies.some(
      (c) =>
        c.name.toLowerCase().includes("session") ||
        c.name.toLowerCase().includes("login"),
    );

    sendResponse({
      success: results.every((r) => r.success),
      results: results,
      hasSessionCookie: hasSessionCookie,
      message: `Set ${results.filter((r) => r.success).length} of ${data.cookies.length} cookies`,
    });
  } catch (error) {
    console.error("Error in handleSetCookies:", error);
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

// Handle API fetch requests from popup
async function handleFetchApi(url, options, sendResponse) {
  try {
    console.log("Fetching API:", url, options);

    // Make the actual fetch request from background script (no CORS restrictions)
    // Note: credentials: "include" can cause CORS issues if the server doesn't explicitly allow it.
    // For webhooks, we usually don't need to send extension cookies.
    const fetchOptions = { ...options };
    if (!fetchOptions.credentials) {
      fetchOptions.credentials = "omit"; // Default to omit for better CORS compatibility
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    fetchOptions.signal = controller.signal;

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Get response data
    let data = null;
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch (parseError) {
      console.warn("Could not parse response as JSON:", parseError);
      data = await response.text();
    }

    console.log(
      "Fetch API response status:",
      response.status,
      response.statusText,
    );

    sendResponse({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: data,
    });
  } catch (error) {
    console.error("Error in handleFetchApi:", error);

    // Provide more detailed error information
    let errorMessage = error.message;
    let errorStatus = 0;

    if (error.name === "AbortError") {
      errorMessage = "Request timeout after 30 seconds";
      errorStatus = 408;
    } else if (error.message.includes("Failed to fetch")) {
      errorMessage = "Network error: Failed to connect to server";
      errorStatus = 0;
    }

    sendResponse({
      ok: false,
      status: errorStatus,
      statusText: errorMessage,
      error: errorMessage,
      data: null,
    });
  }
}

// Listen for tab updates to detect TikTok login
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.includes("tiktok.com")) {
    // Check if user is logged in on TikTok
    checkTikTokLoginStatus(tabId);
  }
});

// Check TikTok login status
async function checkTikTokLoginStatus(tabId) {
  try {
    // Inject script to check login status
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Check for common login indicators
        const hasLoginButton = !!document.querySelector(
          '[data-e2e="login-button"]',
        );
        const hasUploadButton = !!document.querySelector(
          '[data-e2e="upload-btn"]',
        );
        const hasUserAvatar = !!document.querySelector(
          '[data-e2e="user-avatar"]',
        );

        return {
          isLoggedIn: !hasLoginButton && (hasUploadButton || hasUserAvatar),
          hasLoginButton,
          hasUploadButton,
          hasUserAvatar,
          url: window.location.href,
        };
      },
    });

    const status = results[0]?.result;
    if (status?.isLoggedIn) {
      console.log("User is logged into TikTok");
      // Store login status
      chrome.storage.local.set({
        tiktokLoggedIn: true,
        tiktokLoginCheck: Date.now(),
      });
    }
  } catch (error) {
    // Ignore errors (tab might not have permission)
    console.debug("Could not check TikTok login status:", error.message);
  }
}

// Periodically clean up old data
chrome.alarms.create("cleanup", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanup") {
    cleanupOldData();
  }
});

async function cleanupOldData() {
  try {
    const data = await chrome.storage.local.get(null);
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const itemsToRemove = [];
    for (const [key, value] of Object.entries(data)) {
      if (
        key.startsWith("temp_") &&
        value.timestamp &&
        value.timestamp < oneWeekAgo
      ) {
        itemsToRemove.push(key);
      }
    }

    if (itemsToRemove.length > 0) {
      await chrome.storage.local.remove(itemsToRemove);
      console.log(`Cleaned up ${itemsToRemove.length} old items`);
    }
  } catch (error) {
    console.error("Error in cleanup:", error);
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);

  // Set default storage values
  chrome.storage.local.set({
    extensionInstalled: true,
    installDate: new Date().toISOString(),
    version: "1.0.0",
  });

  // Create context menu items if the API is available
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.create({
        id: "openDashboard",
        title: "Open TikTok Automator Dashboard",
        contexts: ["action"],
      });

      chrome.contextMenus.create({
        id: "checkLoginStatus",
        title: "Check TikTok Login Status",
        contexts: ["action"],
      });
    } catch (error) {
      console.warn("Could not create context menus:", error);
    }
  }
});

// Handle context menu clicks if the API is available
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "openDashboard") {
      chrome.tabs.create({
        url: "https://automatorx.thairiches.com/dashboard",
      });
    } else if (info.menuItemId === "checkLoginStatus") {
      if (tab?.url?.includes("tiktok.com")) {
        checkTikTokLoginStatus(tab.id);
      } else {
        chrome.tabs.create({ url: "https://www.tiktok.com" });
      }
    }
  });
}

// Listen for web requests to TikTok to monitor login state (if API is available)
if (chrome.webRequest && chrome.webRequest.onCompleted) {
  try {
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        // Check for login-related requests
        if (
          details.url.includes("tiktok.com") &&
          (details.url.includes("/login/") || details.url.includes("/auth/"))
        ) {
          console.log("Detected TikTok auth request:", details.url);

          // Update login status after a short delay
          setTimeout(() => {
            if (details.tabId > 0) {
              checkTikTokLoginStatus(details.tabId);
            }
          }, 2000);
        }
      },
      { urls: ["*://*.tiktok.com/*"] },
    );
  } catch (error) {
    console.warn("Could not set up web request listener:", error);
  }
}

// Extension ID is available via chrome.runtime.id
// Web app can get it through message passing (EXTENSION_ID_REQUEST action)

// Persistent window functions
async function openPersistentWindow() {
  try {
    // Check if window already exists
    if (persistentWindowId !== null) {
      try {
        const window = await chrome.windows.get(persistentWindowId);
        if (window) {
          // Window exists, focus it
          await chrome.windows.update(persistentWindowId, { focused: true });
          console.log("Persistent window already exists, focusing it");
          return;
        }
      } catch (error) {
        // Window doesn't exist, reset ID
        persistentWindowId = null;
      }
    }

    // Create new window
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL("persistent-window.html"),
      type: "popup",
      width: 450,
      height: 650,
      focused: true,
    });

    persistentWindowId = window.id;
    console.log("Created persistent window with ID:", persistentWindowId);

    // Listen for window close
    chrome.windows.onRemoved.addListener(function listener(windowId) {
      if (windowId === persistentWindowId) {
        persistentWindowId = null;
        chrome.windows.onRemoved.removeListener(listener);
        console.log("Persistent window closed");
      }
    });
  } catch (error) {
    console.error("Error opening persistent window:", error);
  }
}

async function closePersistentWindow() {
  if (persistentWindowId !== null) {
    try {
      await chrome.windows.remove(persistentWindowId);
      persistentWindowId = null;
      console.log("Closed persistent window");
    } catch (error) {
      console.error("Error closing persistent window:", error);
    }
  }
}

// Open persistent window when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  openPersistentWindow();
});
