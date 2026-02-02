// TikTok Video Automator Chrome Extension
// Content script for the web app (localhost:3000)

console.log("TikTok Automator web app content script loaded");

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Web app content script received message:", message);

  if (message.action === "GET_USER_ID") {
    handleGetUserId(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.action === "PING") {
    sendResponse({ success: true, message: "Web app content script is alive" });
    return true;
  }

  sendResponse({ success: false, error: "Unknown action" });
});

// Handle GET_USER_ID request
function handleGetUserId(sendResponse) {
  try {
    console.log("Handling GET_USER_ID request");

    // Try to get user from localStorage (where the web app stores it)
    const userData = localStorage.getItem("user");

    if (userData) {
      try {
        const user = JSON.parse(userData);
        console.log("Found user in localStorage:", user);

        sendResponse({
          success: true,
          userId: user.id,
          email: user.email,
          name: user.name,
        });
        return;
      } catch (parseError) {
        console.error("Error parsing user data:", parseError);
      }
    }

    // Try to get user from AuthContext (if it's accessible)
    if (window.__TIKTOK_AUTOMATOR_AUTH__) {
      const user = window.__TIKTOK_AUTOMATOR_AUTH__.getCurrentUser();
      if (user) {
        console.log("Found user in AuthContext:", user);
        sendResponse({
          success: true,
          userId: user.id,
          email: user.email,
          name: user.name,
        });
        return;
      }
    }

    // Try to get user from window object (if the app exposes it)
    if (window.tiktokAutomatorUser) {
      console.log("Found user in window object:", window.tiktokAutomatorUser);
      sendResponse({
        success: true,
        userId: window.tiktokAutomatorUser.id,
        email: window.tiktokAutomatorUser.email,
        name: window.tiktokAutomatorUser.name,
      });
      return;
    }

    // No user found
    console.log("No user found in web app");
    sendResponse({
      success: false,
      error: "User not logged in or user data not accessible",
    });
  } catch (error) {
    console.error("Error in handleGetUserId:", error);
    sendResponse({
      success: false,
      error: error.message,
    });
  }
}

// Inject a helper to expose auth data to content script
function injectAuthHelper() {
  // Check if we're on the web app domain
  if (
    !window.location.href.includes("localhost:3000") &&
    !window.location.href.includes("tiktok-automator")
  ) {
    return;
  }

  // Create a helper object that can access auth data
  const script = document.createElement("script");
  script.textContent = `
    // Helper to expose auth data to content script
    (function() {
      // Try to get user from localStorage
      function getUserFromLocalStorage() {
        try {
          const userData = localStorage.getItem('user');
          return userData ? JSON.parse(userData) : null;
        } catch (e) {
          return null;
        }
      }

      // Try to get user from React context
      function getUserFromReactContext() {
        // This is a hacky way to try to access React context
        // It might not work in all cases
        const reactRoot = document.querySelector('[data-reactroot], #__next');
        if (!reactRoot) return null;
        
        // Look for user data in React dev tools if available
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          try {
            const roots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots();
            for (const [key, root] of roots) {
              if (root.current && root.current.memoizedProps) {
                const props = root.current.memoizedProps;
                if (props.user || props.auth) {
                  return props.user || props.auth.user;
                }
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
        return null;
      }

      // Expose user data
      window.__TIKTOK_AUTOMATOR_AUTH__ = {
        getCurrentUser: function() {
          return getUserFromLocalStorage() || getUserFromReactContext();
        }
      };

      console.log('TikTok Automator auth helper injected');
    })();
  `;
  document.head.appendChild(script);
}

// Run on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectAuthHelper);
} else {
  injectAuthHelper();
}

// Also inject when page changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(injectAuthHelper, 1000); // Wait a bit for SPA to load
  }
}).observe(document, { subtree: true, childList: true });

// Export for debugging
window.TikTokAutomatorWebApp = {
  handleGetUserId,
  injectAuthHelper,
};
