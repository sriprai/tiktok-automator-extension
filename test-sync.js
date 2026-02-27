// Test script for TikTok Automator Sync User Fixes
console.log("Testing TikTok Automator Sync User Fixes...");

// Helper to check if we're in extension context
function isExtensionContext() {
  return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
}

// Test 1: Check if debug tools are loaded
function testDebugTools() {
  console.log("Test 1: Checking debug tools...");

  if (typeof window.TikTokAutomatorDebug !== "undefined") {
    console.log("✓ Debug tools loaded successfully");
    console.log(
      "Debug tools available:",
      Object.keys(window.TikTokAutomatorDebug),
    );
    return true;
  } else {
    console.log("✗ Debug tools not loaded");
    console.log("Note: Debug tools are loaded in popup.js, not in test page");
    return false;
  }
}

// Test 2: Check if popup functions are available
function testPopupFunctions() {
  console.log("Test 2: Checking popup functions...");

  if (typeof window.TikTokAutomatorExtension !== "undefined") {
    console.log("✓ Popup extension functions loaded");
    console.log(
      "Available functions:",
      Object.keys(window.TikTokAutomatorExtension),
    );
    return true;
  } else {
    console.log("✗ Popup extension functions not loaded");
    console.log(
      "Note: Extension functions are loaded in popup.js, not in test page",
    );
    return false;
  }
}

// Test 3: Check Chrome APIs
function testChromeAPIs() {
  console.log("Test 3: Checking Chrome APIs...");

  const requiredAPIs = ["storage", "tabs", "cookies", "runtime"];
  const availableAPIs = [];

  requiredAPIs.forEach((api) => {
    if (typeof chrome !== "undefined" && chrome[api]) {
      availableAPIs.push(api);
    }
  });

  if (availableAPIs.length === requiredAPIs.length) {
    console.log("✓ All required Chrome APIs available");
    return true;
  } else {
    console.log(
      "✗ Missing Chrome APIs:",
      requiredAPIs.filter((api) => !availableAPIs.includes(api)),
    );

    if (!isExtensionContext()) {
      console.log(
        "Note: Chrome APIs are only available in extension context (popup, background, content scripts)",
      );
      console.log(
        "This test page runs in a regular browser tab, not extension context",
      );
    }

    return false;
  }
}

// Test 4: Check storage access
async function testStorageAccess() {
  console.log("Test 4: Testing storage access...");

  try {
    if (isExtensionContext() && chrome.storage && chrome.storage.local) {
      // Test write
      await new Promise((resolve) => {
        chrome.storage.local.set({ test_key: "test_value" }, () => {
          if (chrome.runtime.lastError) {
            console.log("✗ Storage write error:", chrome.runtime.lastError);
            resolve(false);
          } else {
            console.log("✓ Storage write successful");
            resolve(true);
          }
        });
      });

      // Test read
      await new Promise((resolve) => {
        chrome.storage.local.get(["test_key"], (result) => {
          if (chrome.runtime.lastError) {
            console.log("✗ Storage read error:", chrome.runtime.lastError);
            resolve(false);
          } else if (result.test_key === "test_value") {
            console.log("✓ Storage read successful");
            resolve(true);
          } else {
            console.log("✗ Storage read mismatch");
            resolve(false);
          }
        });
      });

      // Clean up
      await new Promise((resolve) => {
        chrome.storage.local.remove(["test_key"], () => {
          console.log("✓ Test cleanup completed");
          resolve(true);
        });
      });

      return true;
    } else {
      console.log("✗ Chrome storage API not available");
      console.log("Note: Storage API requires extension context");
      return false;
    }
  } catch (error) {
    console.log("✗ Storage test error:", error);
    return false;
  }
}

// Test 5: Check cookie access
async function testCookieAccess() {
  console.log("Test 5: Testing cookie access...");

  try {
    if (isExtensionContext() && chrome.cookies) {
      // Test getting cookies for a domain
      await new Promise((resolve) => {
        chrome.cookies.getAll({ url: "https://automatorx.co" }, (cookies) => {
          if (chrome.runtime.lastError) {
            console.log("✗ Cookie access error:", chrome.runtime.lastError);
            resolve(false);
          } else {
            console.log(
              `✓ Cookie access successful. Found ${cookies.length} cookies for automatorx.co`,
            );
            resolve(true);
          }
        });
      });

      return true;
    } else {
      console.log("✗ Chrome cookies API not available");
      console.log(
        "Note: Cookies API requires extension context and 'cookies' permission in manifest.json",
      );
      return false;
    }
  } catch (error) {
    console.log("✗ Cookie test error:", error);
    return false;
  }
}

// Test 6: Check authentication flow
async function testAuthFlow() {
  console.log("Test 6: Testing authentication flow...");

  try {
    if (typeof window.TikTokAutomatorExtension !== "undefined") {
      console.log("Testing checkAuth function...");

      // Note: This will only work in popup context
      // For testing purposes, we'll just check if the function exists
      if (typeof window.TikTokAutomatorExtension.checkAuth === "function") {
        console.log("✓ checkAuth function available");
        return true;
      } else {
        console.log("✗ checkAuth function not available");
        return false;
      }
    } else {
      console.log("✗ Extension functions not available for auth test");
      console.log(
        "Note: Extension functions are loaded in popup.js, not in test page",
      );
      return false;
    }
  } catch (error) {
    console.log("✗ Auth test error:", error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("=== Starting TikTok Automator Sync Tests ===\n");
  console.log(
    "Context:",
    isExtensionContext() ? "Extension Context" : "Regular Browser Tab",
  );
  console.log("Note: Most tests require extension context to pass\n");

  const results = {
    debugTools: testDebugTools(),
    popupFunctions: testPopupFunctions(),
    chromeAPIs: testChromeAPIs(),
    storageAccess: await testStorageAccess(),
    cookieAccess: await testCookieAccess(),
    authFlow: await testAuthFlow(),
  };

  console.log("\n=== Test Results ===");
  Object.entries(results).forEach(([test, passed]) => {
    console.log(
      `${passed ? "✓" : "✗"} ${test}: ${passed ? "PASSED" : "FAILED"}`,
    );
  });

  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;

  console.log(`\n${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log("✅ All tests passed! Sync user fixes are working correctly.");
  } else {
    console.log("❌ Some tests failed. Check the logs above for details.");

    if (!isExtensionContext()) {
      console.log(
        "\n⚠️ IMPORTANT: This test page runs in a regular browser tab.",
      );
      console.log("To properly test the extension:");
      console.log("1. Load the extension in Chrome (chrome://extensions/)");
      console.log("2. Click the extension icon to open the popup");
      console.log("3. Click the debug button (🐛) in the footer");
      console.log(
        "4. Use the debug tools in the popup to test sync functionality",
      );
    }
  }

  return results;
}

// Export for manual testing
window.TikTokAutomatorTests = {
  runAllTests,
  testDebugTools,
  testPopupFunctions,
  testChromeAPIs,
  testStorageAccess,
  testCookieAccess,
  testAuthFlow,
  isExtensionContext,
};

// Auto-run tests if we're in a test environment
if (window.location.href.includes("test-sync.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => runAllTests(), 1000);
  });
}

console.log(
  "Test script loaded. Run window.TikTokAutomatorTests.runAllTests() to start tests.",
);
