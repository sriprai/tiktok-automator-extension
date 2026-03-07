// TikTok Video Automator Chrome Extension
// Content script for TikTok.com

console.log("TikTok Automator content script loaded");

// Check if we just redirected from a post
if (window.location.href.includes("/tiktokstudio/content")) {
  const lastTaskId = localStorage.getItem("tt_automator_last_task_id");
  if (lastTaskId) {
    console.log("Detected redirect to content page for task:", lastTaskId);
    // Note: Webhook is now sent from popup.js, not from content script
    // sendSuccessWebhook(lastTaskId, "redirect_on_load");
    // Clear it so we don't send multiple times
    localStorage.removeItem("tt_automator_last_task_id");
  }
}

async function sendSuccessWebhook(taskId, method) {
  const webhookUrl =
    "https://n8n.srv803794.hstgr.cloud/webhook/df76bbf9-ed7e-4f95-a62e-2495fe836c63";
  console.log(`Sending success webhook for task ${taskId} via ${method}...`);
  console.log(`Webhook URL: ${webhookUrl}`);

  // Log the actual payload being sent
  const payload = {
    taskId: taskId,
    status: "success",
    timestamp: new Date().toISOString(),
    url: window.location.href,
    detectionMethod: method,
  };
  console.log("Webhook payload:", JSON.stringify(payload, null, 2));

  try {
    chrome.runtime.sendMessage(
      {
        action: "FETCH_API",
        url: webhookUrl,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending webhook message to background:",
            chrome.runtime.lastError,
          );
          return;
        }

        console.log("Webhook background response:", response);

        if (response && response.ok) {
          console.log(
            `✅ Webhook sent successfully for task ${taskId}! Status: ${response.status}`,
          );
          // Log the actual response data
          if (response.data) {
            console.log("Webhook response data:", response.data);
          }
        } else {
          console.error(
            `❌ Webhook failed for task ${taskId}. Status: ${response?.status || "Unknown"}, Error: ${response?.error || "Unknown error"}`,
          );
          // Log more details about the failure
          if (response?.data) {
            console.error("Webhook error response:", response.data);
          }
        }
      },
    );
  } catch (error) {
    console.error("Failed to send webhook message:", error);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);

  if (message.action === "UPLOAD_VIDEO") {
    // Store task ID if provided
    if (message.data && message.data.taskId) {
      const taskId = message.data.taskId;
      window.currentTaskId = taskId;
      console.log("Stored Task ID in window:", window.currentTaskId);
      // Also store in localStorage as backup for redirects
      localStorage.setItem("tt_automator_last_task_id", taskId);
    }
    handleVideoUpload(message.data, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.action === "SET_CAPTION") {
    setCaption(message.data.caption).then(sendResponse);
    return true;
  }

  if (message.action === "ADD_PRODUCT") {
    addProduct(message.data.productId).then(sendResponse);
    return true;
  }

  if (
    message.action === "CLICK_POST" ||
    message.action === "CLICK_POST_BUTTON"
  ) {
    // Store task ID if provided
    if (message.data && message.data.taskId) {
      const taskId = message.data.taskId;
      window.currentTaskId = taskId;
      console.log(
        "Stored Task ID in window for CLICK_POST:",
        window.currentTaskId,
      );
      // Also store in localStorage as backup for redirects
      localStorage.setItem("tt_automator_last_task_id", taskId);
    }
    clickPostButton().then(sendResponse);
    return true;
  }

  if (message.action === "TOGGLE_AI_CONTENT") {
    toggleAIContent().then(sendResponse);
    return true;
  }

  if (message.action === "SET_SCHEDULE") {
    setSchedule(message.data.hour, message.data.minute).then(sendResponse);
    return true;
  }

  if (message.action === "CHECK_LOGIN_STATUS") {
    const status = checkLoginStatus();
    sendResponse({ success: true, ...status });
    return true;
  }

  if (message.action === "GET_PAGE_INFO") {
    const info = getPageInfo();
    sendResponse({ success: true, ...info });
    return true;
  }

  sendResponse({ success: false, error: "Unknown action" });
});

// Bulk processing logic for TikTok Studio
async function handleTikTokBulkProcessing() {
  const result = await chrome.storage.local.get([
    "isBulkProcessing",
    "bulkQueue",
    "currentBulkIndex",
  ]);
  if (!result.isBulkProcessing || !result.bulkQueue) return;

  const currentIndex = result.currentBulkIndex || 0;
  const currentVideo = result.bulkQueue[currentIndex];

  if (!currentVideo) {
    console.log("No video found in queue for index:", currentIndex);
    return;
  }

  // Create process detection UI
  const statusOverlay = document.createElement("div");
  statusOverlay.id = "bulk-status-overlay";
  statusOverlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 20px;
    border-radius: 12px;
    z-index: 10000;
    font-family: sans-serif;
    border: 1px solid #fe2c55;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    min-width: 250px;
  `;
  statusOverlay.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: #fe2c55; font-size: 16px;">Bulk Posting Active</h3>
    <div style="font-size: 14px; margin-bottom: 8px;">Video: ${currentIndex + 1} / ${result.bulkQueue.length}</div>
    <div id="bulk-step-text" style="font-size: 12px; color: #ccc;">Initializing...</div>
    <div style="margin-top: 10px; height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
      <div style="width: ${((currentIndex + 1) / result.bulkQueue.length) * 100}%; height: 100%; background: #fe2c55;"></div>
    </div>
  `;
  document.body.appendChild(statusOverlay);

  const updateStep = (text) => {
    const el = document.getElementById("bulk-step-text");
    if (el) el.textContent = text;
    console.log(`Bulk Step: ${text}`);
  };

  updateStep("Waiting for page load...");
  await waitForPageLoad();

  updateStep("Uploading video...");
  const uploadResult = await uploadVideo(currentVideo.video_url);
  if (!uploadResult.success) {
    updateStep("Upload failed: " + uploadResult.error);
    return;
  }

  updateStep("Processing video...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  updateStep("Setting caption...");
  await setCaption(currentVideo.caption);

  if (
    currentVideo.product_id &&
    currentVideo.product_id.trim() !== "" &&
    currentVideo.product_id !== "manual" &&
    currentVideo.product_id !== "none"
  ) {
    updateStep("Adding product...");
    await addProduct(currentVideo.product_id);
  }

  updateStep("Enabling AI content...");
  await toggleAIContent();

  if (currentVideo.is_schedule && currentVideo.schedule_hour) {
    updateStep(
      `Setting schedule: ${currentVideo.schedule_hour}:${currentVideo.schedule_minute}`,
    );
    await setSchedule(currentVideo.schedule_hour, currentVideo.schedule_minute);
  }

  updateStep("Waiting for Post button...");

  const checkPostButton = async () => {
    const postButton = document.querySelector(
      'button[data-e2e="post_video_button"]',
    );
    if (postButton) {
      const isDisabled =
        postButton.disabled ||
        postButton.getAttribute("aria-disabled") === "true" ||
        postButton.getAttribute("data-disabled") === "true" ||
        postButton.classList.contains("Button--disabled");

      if (!isDisabled) {
        const isScheduleMode = postButton.textContent
          .toLowerCase()
          .includes("schedule");
        updateStep(
          isScheduleMode
            ? "Clicking Schedule button..."
            : "Clicking Post button...",
        );
        postButton.click();

        setTimeout(async () => {
          const modalConfirm = document.querySelector(
            ".common-modal-confirm-modal",
          );
          if (modalConfirm) {
            const confirmButtons = Array.from(
              modalConfirm.querySelectorAll("button"),
            );
            const confirmBtn = confirmButtons.find((btn) => {
              const text = btn.textContent.toLowerCase();
              return text.includes("post now") || text.includes("schedule now");
            });
            if (confirmBtn) {
              updateStep("Confirming...");
              confirmBtn.click();
            }
          }

          updateStep("Updating status to database...");
          try {
            const webhookUrl =
              "https://n8n.srv803794.hstgr.cloud/webhook/df76bbf9-ed7e-4f95-a62e-2495fe836c63";
            const payload = {
              taskId: currentVideo.id,
              status: "Posted to Tiktok",
              timestamp: new Date().toISOString(),
              url: window.location.href,
              detectionMethod: "bulk_auto_post",
            };

            await chrome.runtime.sendMessage({
              action: "FETCH_API",
              url: webhookUrl,
              options: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              },
            });
          } catch (e) {
            console.error("Webhook failed", e);
          }

          const randomDelay =
            Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000;
          const nextStartTime = Date.now() + randomDelay;

          const countdownInterval = setInterval(() => {
            const remaining = Math.round((nextStartTime - Date.now()) / 1000);
            if (remaining > 0) {
              updateStep(`Next video in ${remaining}s (Random Delay)`);
            } else {
              clearInterval(countdownInterval);
            }
          }, 1000);

          setTimeout(async () => {
            const storage = await chrome.storage.local.get([
              "currentBulkIndex",
              "bulkQueue",
            ]);
            const nextIndex = (storage.currentBulkIndex || 0) + 1;
            await chrome.storage.local.set({ currentBulkIndex: nextIndex });

            if (nextIndex < storage.bulkQueue.length) {
              window.location.href =
                "https://www.tiktok.com/tiktokstudio/upload";
            } else {
              await chrome.storage.local.set({ isBulkProcessing: false });
              alert("Bulk Posting Completed!");
              window.location.href = "https://www.automatorx.co/dashboard";
            }
          }, randomDelay);
        }, 2000);
        return true;
      }
    }
    return false;
  };

  const pollInterval = setInterval(async () => {
    if (await checkPostButton()) {
      clearInterval(pollInterval);
    }
  }, 2000);
}

// Run bulk processing check on TikTok Studio upload page
if (window.location.href.includes("tiktok.com/tiktokstudio/upload")) {
  handleTikTokBulkProcessing();
}

// Handle video upload automation
async function handleVideoUpload(data, sendResponse) {
  try {
    console.log("Starting video upload automation:", data);

    // Check if we're on TikTok upload page (regular or studio)
    // Handle URLs with query parameters like ?from=creator_center
    const currentUrl = window.location.href;
    const urlObj = new URL(currentUrl);
    const pathname = urlObj.pathname;

    // Check for exact upload paths (with or without trailing slash)
    const isRegularUpload = pathname === "/upload" || pathname === "/upload/";
    const isStudioUpload =
      pathname === "/tiktokstudio/upload" ||
      pathname === "/tiktokstudio/upload/";

    if (!isRegularUpload && !isStudioUpload) {
      sendResponse({
        success: false,
        error:
          "Not on TikTok upload page. Please navigate to:\n" +
          "1. https://www.tiktok.com/upload (regular upload)\n" +
          "2. https://www.tiktok.com/tiktokstudio/upload (studio upload)\n\n" +
          "Note: URLs with query parameters like ?from=creator_center are also supported.",
      });
      return;
    }

    // Check login status
    const loginStatus = checkLoginStatus();
    if (!loginStatus.isLoggedIn) {
      sendResponse({
        success: false,
        error: "Not logged into TikTok. Please log in first.",
        loginStatus,
      });
      return;
    }

    // Step 1: Wait for page to be fully loaded
    await waitForPageLoad();

    // Step 2: Upload video
    const uploadResult = await uploadVideo(data.videoUrl);
    if (!uploadResult.success) {
      sendResponse(uploadResult);
      return;
    }

    // Step 3: Wait for processing to complete and caption input to appear
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 4: Success!
    sendResponse({
      success: true,
      message:
        "Video uploaded! Use the 'Caption' button in the extension to fill the text.",
      steps: {
        upload: uploadResult,
        caption: {
          success: true,
          note: "Ready for manual fill from extension",
        },
      },
    });
  } catch (error) {
    console.error("Error in handleVideoUpload:", error);
    // Ensure we send a plain object, not an Error object which can be empty when stringified
    sendResponse({
      success: false,
      error: error.message || "Unknown error during upload",
      stack: error.stack,
    });
  }
}

// Helper functions
function checkLoginStatus() {
  // Check for common login indicators on TikTok (both regular and studio)

  // 1. Check for login buttons (indicates NOT logged in)
  // Using valid CSS selectors only
  const loginSelectors = [
    '[data-e2e="login-button"]',
    '[data-e2e="login"]',
    'button[data-e2e*="login"]',
    'a[href*="login"]',
    // Check for buttons that might be login buttons by checking their text
    "button",
    'a[role="button"]',
  ];

  let hasLoginButton = false;
  for (const selector of loginSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent.toLowerCase();
        if (
          text.includes("log in") ||
          text.includes("sign in") ||
          text.includes("login")
        ) {
          hasLoginButton = true;
          break;
        }
      }
      if (hasLoginButton) break;
    } catch (e) {
      console.warn(`Error with selector: ${selector}`, e);
    }
  }

  // 2. Check for user indicators (indicates logged in)
  const hasUserAvatar = !!document.querySelector(
    '[data-e2e="user-avatar"], [data-e2e="avatar"], img[alt*="avatar"], .avatar',
  );
  const hasUserMenu = !!document.querySelector(
    '[data-e2e="user-menu"], [data-e2e="menu"], [aria-label*="menu"]',
  );
  const hasUserProfile = !!document.querySelector(
    '[href*="/@"]:not([href*="tiktok.com/@tiktok"])',
  );
  const hasUserDropdown = !!document.querySelector(
    '[data-e2e="dropdown-menu"], [role="menu"]',
  );

  // 3. Check for upload-specific indicators (studio might have different selectors)
  // Check for upload/post buttons by looking for common patterns
  const uploadSelectors = [
    '[data-e2e="upload-btn"]',
    'button[data-e2e*="upload"]',
    'button[aria-label*="upload"]',
    "button", // Check all buttons for upload/post text
  ];

  let hasUploadButton = false;
  for (const selector of uploadSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        // Check if button text contains upload/post keywords
        const text = element.textContent.toLowerCase();
        if (
          text.includes("upload") ||
          text.includes("post") ||
          text.includes("publish")
        ) {
          hasUploadButton = true;
          break;
        }
      }
      if (hasUploadButton) break;
    } catch (e) {
      console.warn(`Error with selector: ${selector}`, e);
    }
  }

  const hasStudioElements = !!document.querySelector(
    '.tiktok-studio, [data-e2e*="studio"]',
  );

  // 4. Check for logged-in UI patterns
  const hasLoggedInUI =
    document.body.innerHTML.includes('"isLoggedIn":true') ||
    document.body.innerHTML.includes('"loggedIn":true') ||
    document.body.innerHTML.includes("isAuthenticated") ||
    window.localStorage.getItem("tt-target-id") ||
    window.localStorage.getItem("sid_tt");

  // For TikTok Studio, we need different detection logic
  const isStudioPage = window.location.href.includes("tiktokstudio");

  if (isStudioPage) {
    // Studio-specific login detection
    // Check for post button by checking all buttons for post/publish text
    let hasPostButton = false;
    const allButtons = document.querySelectorAll("button");
    for (const button of allButtons) {
      const text = button.textContent.toLowerCase();
      if (text.includes("post") || text.includes("publish")) {
        hasPostButton = true;
        break;
      }
    }

    const studioLoggedIn =
      // Check for user info in studio
      !!document.querySelector('[data-e2e="user-info"], .user-info') ||
      // Check for upload capability
      !!document.querySelector('input[type="file"]:not([disabled])') ||
      // Check for post button
      hasPostButton ||
      // Check for any user-related elements
      hasUserAvatar ||
      hasUserMenu ||
      hasUserProfile;

    return {
      isLoggedIn: !hasLoginButton && studioLoggedIn,
      hasLoginButton,
      hasUploadButton,
      hasUserAvatar,
      hasUserMenu,
      hasUserProfile,
      hasUserDropdown,
      hasStudioElements,
      hasLoggedInUI,
      isStudioPage,
      url: window.location.href,
    };
  }

  // Regular TikTok upload page detection
  const isLoggedIn =
    !hasLoginButton &&
    (hasUploadButton ||
      hasUserAvatar ||
      hasUserMenu ||
      hasUserProfile ||
      hasUserDropdown ||
      hasLoggedInUI);

  return {
    isLoggedIn,
    hasLoginButton,
    hasUploadButton,
    hasUserAvatar,
    hasUserMenu,
    hasUserProfile,
    hasUserDropdown,
    hasStudioElements,
    hasLoggedInUI,
    isStudioPage: false,
    url: window.location.href,
  };
}

function getPageInfo() {
  const currentUrl = window.location.href;
  const urlObj = new URL(currentUrl);
  const pathname = urlObj.pathname;

  // Check for exact upload paths (with or without trailing slash)
  const isUploadPage =
    pathname === "/upload" ||
    pathname === "/upload/" ||
    pathname === "/tiktokstudio/upload" ||
    pathname === "/tiktokstudio/upload/";

  return {
    url: currentUrl,
    title: document.title,
    isUploadPage: isUploadPage,
    hasVideoInput: !!document.querySelector('input[type="file"]'),
    hasCaptionInput: !!document.querySelector(
      'textarea, [contenteditable="true"]',
    ),
    timestamp: Date.now(),
  };
}

async function waitForPageLoad() {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", () => resolve());
    }
  });
}

async function waitForElement(selector, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for element: ${selector}`));
        return;
      }

      setTimeout(checkElement, 500);
    };

    checkElement();
  });
}

async function uploadVideo(videoUrl) {
  try {
    console.log("Uploading video from URL:", videoUrl);

    // Find file input
    // TikTok Studio uses a hidden file input, sometimes it takes time to appear
    // or is inside an iframe. We try to find it with a longer timeout and more specific check.
    let fileInput = document.querySelector('input[type="file"]');

    if (!fileInput) {
      console.log("File input not found immediately, waiting...");
      try {
        fileInput = await waitForElement('input[type="file"]', 30000);
      } catch (e) {
        // Fallback: try to find any file input in the page
        fileInput = document.querySelector('input[type="file"]');
      }
    }

    if (!fileInput) {
      return { success: false, error: "Could not find file upload input" };
    }

    // Download video from URL
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch video: ${response.status} ${response.statusText}`,
      );
    }

    const blob = await response.blob();
    const file = new File([blob], "video.mp4", { type: "video/mp4" });

    // Create a DataTransfer object and set the file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Set the files property of the input
    fileInput.files = dataTransfer.files;

    // Trigger change event
    const event = new Event("change", { bubbles: true });
    fileInput.dispatchEvent(event);

    // Wait for upload to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check for upload progress indicators
    const uploadProgress = document.querySelector(
      '[data-e2e="upload-progress"]',
    );
    const uploadError = document.querySelector('[data-e2e="upload-error"]');

    if (uploadError) {
      return {
        success: false,
        error: "Upload error detected: " + uploadError.textContent,
      };
    }

    return { success: true, message: "Video uploaded successfully" };
  } catch (error) {
    console.error("Error uploading video:", error);
    return { success: false, error: error.message };
  }
}

async function setCaption(caption) {
  try {
    const textToSet = caption.trim();
    console.log("Setting caption with Draft.js specific handling...");

    // Find the caption editor - prioritize Draft.js editor
    const editorSelectors = [
      '.public-DraftEditor-content[contenteditable="true"]',
      '[contenteditable="true"].DraftEditor-content',
      '[contenteditable="true"]',
      "textarea",
      'input[type="text"]',
      ".caption-input",
      ".caption-editor",
    ];

    let editor = null;
    for (const selector of editorSelectors) {
      editor = document.querySelector(selector);
      if (editor) {
        console.log(`Found editor with selector: ${selector}`);
        break;
      }
    }

    if (!editor) {
      return { success: false, error: "Could not find caption input field" };
    }

    console.log(
      `Editor type: ${editor.tagName}, contenteditable: ${editor.contentEditable}, class: ${editor.className}`,
    );

    // Check if this is a Draft.js editor (TikTok uses Draft.js)
    const isDraftJsEditor = editor.className.includes(
      "public-DraftEditor-content",
    );

    if (isDraftJsEditor) {
      console.log("Detected Draft.js editor - using specialized handling");
      return await handleDraftJsEditor(editor, textToSet);
    } else {
      console.log("Using generic editor handling");
      return await handleGenericEditor(editor, textToSet);
    }
  } catch (error) {
    console.error("Error setting caption:", error);
    return { success: false, error: `Failed to set caption: ${error.message}` };
  }
}

// Specialized handling for Draft.js editors (used by TikTok)
async function handleDraftJsEditor(editor, textToSet) {
  try {
    console.log("Starting Draft.js editor handling...");

    // --- 1. Focus the editor ---
    editor.focus();
    await new Promise((r) => setTimeout(r, 300));

    // --- 2. THOROUGH CLEARING: Remove ALL text completely ---
    console.log("THOROUGH clearing of ALL text content...");

    // Method 1: Select All and Backspace (Most effective for Draft.js state)
    console.log("Selecting all and pressing Backspace/Delete...");
    for (let i = 0; i < 3; i++) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      // Simulate Backspace
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          which: 8,
          bubbles: true,
        }),
      );
      // Simulate Delete
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Delete",
          code: "Delete",
          keyCode: 46,
          which: 46,
          bubbles: true,
        }),
      );

      // Use execCommand to delete selection if possible
      document.execCommand("delete", false, null);

      await new Promise((r) => setTimeout(r, 150));
    }

    // Method 2: Find and COMPLETELY clear ALL data-text spans
    const textSpans = editor.querySelectorAll('span[data-text="true"]');
    textSpans.forEach((span) => {
      span.textContent = "";
      if (span.childNodes.length > 0) {
        span.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) child.textContent = "";
        });
      }
    });

    // Method 3: Clear ALL text nodes in the entire editor
    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      node.textContent = "";
    }

    // Method 4: Clear innerHTML of the data-contents div
    const contentsDiv = editor.querySelector('div[data-contents="true"]');
    if (contentsDiv) {
      contentsDiv.innerHTML =
        '<div data-block="true" data-editor="blqce" data-offset-key="amitv-0-0"><div data-offset-key="amitv-0-0" class="public-DraftStyleDefault-block public-DraftStyleDefault-ltr"><span data-offset-key="amitv-0-0"><span data-text="true"></span></span></div></div>';
    }

    // Method 5: Final programmatic clear
    editor.textContent = "";

    // Wait for Draft.js to process all deletions
    await new Promise((r) => setTimeout(r, 1000));

    // --- 3. Insert new text using Clipboard API (Simulating Paste) ---
    console.log(
      "Inserting new text into Draft.js editor via Paste simulation...",
    );

    editor.focus();
    await new Promise((r) => setTimeout(r, 300));

    let success = false;
    try {
      // Method: Simulate a real Paste event.
      // This is often the most reliable way to update complex editors like Draft.js
      // because it triggers all the internal "onPaste" logic that handles state correctly.
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", textToSet);

      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      });

      editor.dispatchEvent(pasteEvent);
      console.log("Paste event dispatched");

      // If paste event didn't seem to fill the text (Draft.js sometimes needs execCommand)
      // we use execCommand but ONLY if the editor is still empty.
      await new Promise((r) => setTimeout(r, 200));
      if (editor.textContent.length === 0) {
        console.log("Editor still empty, trying execCommand as secondary...");
        document.execCommand("insertText", false, textToSet);
      }
      success = true;
    } catch (e) {
      console.log("Paste simulation failed:", e);
      // Final fallback
      document.execCommand("insertText", false, textToSet);
      success = true;
    }

    // --- 4. Trigger necessary events ---
    console.log("Triggering final Draft.js events...");

    editor.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertText",
        data: textToSet,
        bubbles: true,
        cancelable: true,
      }),
    );
    console.log("Simulating partial typing for state update...");
    if (textToSet.length > 0) {
      // Type first 10 characters to trigger Draft.js state updates
      const charsToType = Math.min(10, textToSet.length);
      for (let i = 0; i < charsToType; i++) {
        const char = textToSet[i];

        const keydownEvent = new KeyboardEvent("keydown", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          keyCode: char.charCodeAt(0),
          which: char.charCodeAt(0),
          bubbles: true,
          cancelable: true,
        });

        const keypressEvent = new KeyboardEvent("keypress", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          keyCode: char.charCodeAt(0),
          which: char.charCodeAt(0),
          bubbles: true,
          cancelable: true,
        });

        const inputEvent = new InputEvent("input", {
          inputType: "insertText",
          data: char,
          bubbles: true,
          cancelable: true,
        });

        editor.dispatchEvent(keydownEvent);
        editor.dispatchEvent(keypressEvent);
        editor.dispatchEvent(inputEvent);

        await new Promise((r) => setTimeout(r, 10));
      }
    }

    // Trigger composition events (important for Draft.js)
    console.log("Triggering composition events...");
    const compositionStart = new CompositionEvent("compositionstart", {
      bubbles: true,
    });
    const compositionUpdate = new CompositionEvent("compositionupdate", {
      bubbles: true,
    });
    const compositionEnd = new CompositionEvent("compositionend", {
      bubbles: true,
    });

    editor.dispatchEvent(compositionStart);
    editor.dispatchEvent(compositionUpdate);
    editor.dispatchEvent(compositionEnd);

    // Trigger change event
    console.log("Triggering change event...");
    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(changeEvent);

    // --- 5. Force Draft.js to update by simulating user interaction ---
    console.log("Forcing Draft.js state update...");

    // Click on the editor to ensure focus
    const clickEvent = new MouseEvent("click", {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: editor.getBoundingClientRect().left + 10,
      clientY: editor.getBoundingClientRect().top + 10,
    });
    editor.dispatchEvent(clickEvent);

    // Focus
    editor.focus();
    await new Promise((r) => setTimeout(r, 200));

    // Simulate arrow key press to move cursor (triggers Draft.js updates)
    const arrowRightEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      code: "ArrowRight",
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(arrowRightEvent);

    const arrowLeftEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      code: "ArrowLeft",
      keyCode: 37,
      which: 37,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(arrowLeftEvent);

    // --- 6. Multiple blur/focus cycles to trigger character count update ---
    console.log("Performing blur/focus cycles...");

    // First cycle
    editor.blur();
    await new Promise((r) => setTimeout(r, 200));

    editor.focus();
    await new Promise((r) => setTimeout(r, 200));

    // Second cycle
    editor.blur();
    await new Promise((r) => setTimeout(r, 200));

    editor.focus();
    await new Promise((r) => setTimeout(r, 200));

    // Final blur
    editor.blur();

    // Wait for any async updates
    await new Promise((r) => setTimeout(r, 500));

    console.log("Draft.js caption set successfully!");
    return {
      success: true,
      message: "Caption set successfully in Draft.js editor",
    };
  } catch (error) {
    console.error("Error in Draft.js handling:", error);

    // Fallback to character-by-character typing
    console.log("Falling back to character-by-character typing...");
    return await fallbackCharacterTyping(editor, textToSet);
  }
}

// Fallback method: Character-by-character typing
async function fallbackCharacterTyping(editor, textToSet) {
  try {
    console.log("Starting character-by-character fallback...");

    // Focus the editor
    editor.focus();
    await new Promise((r) => setTimeout(r, 200));

    // Clear existing content by selecting all and deleting
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Press Delete to clear
    const deleteEvent = new KeyboardEvent("keydown", {
      key: "Delete",
      code: "Delete",
      keyCode: 46,
      which: 46,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(deleteEvent);

    selection.removeAllRanges();
    await new Promise((r) => setTimeout(r, 500));

    // Type each character with realistic delays
    for (let i = 0; i < textToSet.length; i++) {
      const char = textToSet[i];

      // Create keyboard events
      const keydownEvent = new KeyboardEvent("keydown", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });

      const keypressEvent = new KeyboardEvent("keypress", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });

      const inputEvent = new InputEvent("input", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
      });

      editor.dispatchEvent(keydownEvent);
      editor.dispatchEvent(keypressEvent);
      editor.dispatchEvent(inputEvent);

      // Variable delay to simulate human typing
      const delay = Math.random() * 30 + 20; // 20-50ms
      await new Promise((r) => setTimeout(r, delay));
    }

    // Final blur/focus to update count
    editor.blur();
    await new Promise((r) => setTimeout(r, 200));
    editor.focus();

    console.log("Character-by-character fallback completed!");
    return {
      success: true,
      message: "Caption set via character-by-character typing",
    };
  } catch (error) {
    console.error("Error in character typing fallback:", error);
    throw error;
  }
}

// Generic handling for non-Draft.js editors
async function handleGenericEditor(editor, textToSet) {
  try {
    console.log("Starting generic editor handling...");

    // --- 1. Focus the editor ---
    editor.focus();
    await new Promise((r) => setTimeout(r, 200));

    // --- 2. Select all existing text ---
    console.log("Selecting all text...");

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      editor.setSelectionRange(0, editor.value.length);
    } else if (editor.contentEditable === "true") {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    await new Promise((r) => setTimeout(r, 200));

    // --- 3. Clear existing text ---
    console.log("Clearing text...");

    // Simulate Delete key
    const deleteEvent = new KeyboardEvent("keydown", {
      key: "Delete",
      code: "Delete",
      keyCode: 46,
      which: 46,
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(deleteEvent);

    // Clear programmatically
    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      editor.value = "";
    } else if (editor.contentEditable === "true") {
      editor.textContent = "";
    }

    await new Promise((r) => setTimeout(r, 300));

    // --- 4. Insert new text ---
    console.log("Inserting new text...");

    let textInserted = false;

    // Try insertText command first
    try {
      textInserted = document.execCommand("insertText", false, textToSet);
      if (textInserted) {
        console.log("Text inserted via execCommand insertText");
      }
    } catch (e) {
      console.log("execCommand insertText failed");
    }

    // Fallback methods
    if (
      !textInserted &&
      (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT")
    ) {
      editor.value = textToSet;
      textInserted = true;
    } else if (!textInserted && editor.contentEditable === "true") {
      editor.textContent = textToSet;
      textInserted = true;
    }

    // --- 5. Trigger events ---
    console.log("Triggering events...");

    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    editor.dispatchEvent(inputEvent);

    const changeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(changeEvent);

    // --- 6. Finalize ---
    editor.blur();
    await new Promise((r) => setTimeout(r, 200));

    console.log("Generic editor caption set successfully!");
    return {
      success: true,
      message: "Caption set successfully in generic editor",
    };
  } catch (error) {
    console.error("Error in generic editor handling:", error);
    throw error;
  }
}

// ฟังก์ชันสำหรับจัดการชื่อสินค้าให้ปลอดภัย
function cleanProductName(name) {
  if (!name) return "";

  // 1. Remove problematic special characters that might cause issues
  // Remove: +, =, <, >, &, |, ^, %, $, #, @, !, ~, `, *, (, ), {, }, [, ], ", ', ;, :, \, /, ?
  let cleaned = name.replace(/[+=<>&|^%$#@!~`*(){}\[\]"'\\;:/?]/g, "");

  // 2. Replace multiple spaces with single space
  cleaned = cleaned.replace(/\s+/g, " ");

  // 3. Trim and limit to 30 characters
  cleaned = cleaned.trim().substring(0, 30);

  return cleaned;
}

async function addProduct(productId) {
  try {
    console.log("Adding product step-by-step:", productId);

    // 1. Click "Add" button in the "Add link" section
    let addLinkButton = null;
    const allButtons = Array.from(
      document.querySelectorAll('button, [role="button"]'),
    );

    // Look for the specific "Add" button in the "Add link" section
    addLinkButton = allButtons.find((btn) => {
      const text = btn.textContent.trim();
      return text === "Add" || text === "+ Add";
    });

    if (!addLinkButton) {
      return { success: false, error: "Could not find '+ Add' link button" };
    }

    addLinkButton.click();
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Click "Next" on the "Link type" modal (assuming Products is already selected)
    const nextButton = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.textContent.trim() === "Next",
    );
    if (!nextButton) {
      return {
        success: false,
        error: "Could not find 'Next' button on Link type modal",
      };
    }
    nextButton.click();
    await new Promise((r) => setTimeout(r, 1500));

    // 3. Click "Showcase products" tab
    // Based on user feedback, the structure is:
    // <div class="TUXTabBar-item"><button><div>Showcase products</div></button></div>
    let showcaseTab = Array.from(document.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent.includes("Showcase products") ||
        btn.innerText?.includes("Showcase products"),
    );

    if (!showcaseTab) {
      // Fallback to searching all elements
      showcaseTab = Array.from(
        document.querySelectorAll("div, span, p, li"),
      ).find(
        (el) =>
          el.textContent.trim() === "Showcase products" ||
          el.innerText?.trim() === "Showcase products",
      );
    }

    if (showcaseTab) {
      console.log("Found showcase tab, clicking...");
      // Click the button or the element found
      showcaseTab.click();

      // If we found the inner div, click the button parent
      const buttonParent = showcaseTab.closest("button");
      if (buttonParent) {
        buttonParent.click();
      }

      await new Promise((r) => setTimeout(r, 1000));
    } else {
      console.warn("Could not find 'Showcase products' tab");
    }

    // 4. Fill product ID in search input
    // Based on user feedback, the input has class "TUXTextInputCore-input"
    let searchInput = document.querySelector(".TUXTextInputCore-input");
    if (!searchInput) {
      searchInput = document.querySelector(
        'input[placeholder*="Search"], input[placeholder*="product"]',
      );
    }

    if (!searchInput) {
      return { success: false, error: "Could not find product search input" };
    }

    console.log("Found search input, filling product ID...");
    searchInput.focus();

    // Use execCommand to simulate human typing/pasting for React compatibility
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, productId);

    // Fallback if execCommand fails
    if (searchInput.value !== productId) {
      searchInput.value = productId;
    }

    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));

    // Click search icon/button
    // Based on user screenshot, the icon is an SVG inside a div
    const searchIcon = searchInput.parentElement.querySelector("svg");
    if (searchIcon) {
      console.log("Found search icon SVG, clicking its parent...");
      searchIcon.parentElement.click();
      // Also try clicking the wrapper div if it exists
      const wrapper = searchIcon.closest(
        ".TUXTextInputCore-trailingIconWrapper",
      );
      if (wrapper) wrapper.click();
    } else {
      // Fallback: press Enter
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    }

    await new Promise((r) => setTimeout(r, 2500));

    // 5. Select product from results
    // Based on user feedback, the product is in a table row with class "product-tb-row"
    // and contains a radio button with class "TUXRadioStandalone-input"
    const productRows = Array.from(
      document.querySelectorAll("tr.product-tb-row"),
    );
    const targetRow = productRows.find((row) =>
      row.textContent.includes(productId),
    );

    if (!targetRow) {
      return {
        success: false,
        error: `Product ${productId} not found in results table`,
      };
    }

    console.log("Found target product row, selecting radio button...");

    // Try to find the radio input or the TUXRadio container
    // Based on user feedback, the radio input has class "TUXRadioStandalone-input"
    const radioInput = targetRow.querySelector(
      '.TUXRadioStandalone-input, input[type="radio"]',
    );
    if (radioInput) {
      console.log("Found radio input, clicking...");
      radioInput.click();

      // Also try clicking the SVG circles which are often the actual click targets in TUX
      const svgCircles = targetRow.querySelectorAll("svg circle");
      svgCircles.forEach((circle) => {
        if (
          circle.parentElement &&
          typeof circle.parentElement.click === "function"
        ) {
          circle.parentElement.click();
        }
      });

      // Also try clicking the TUXRadioStandalone container
      const radioContainer = radioInput.closest(".TUXRadioStandalone");
      if (radioContainer) radioContainer.click();
    } else {
      // Fallback: click the whole row
      targetRow.click();
    }

    await new Promise((r) => setTimeout(r, 1000));

    // 6. Click "Next" after selecting product
    console.log("Looking for 'Next' button after product selection...");

    let nextAfterSelect = null;

    // Method 1: Find by Text "Next" inside Modal Footer (Most accurate)
    const buttons = Array.from(
      document.querySelectorAll(
        '.common-modal-footer button, [class*="common-modal-footer"] button',
      ),
    );
    nextAfterSelect = buttons.find(
      (btn) =>
        btn.textContent.trim() === "Next" || btn.innerText.trim() === "Next",
    );

    // Method 2: Fallback to Primary button in footer
    if (!nextAfterSelect) {
      nextAfterSelect = document.querySelector(
        ".common-modal-footer .TUXButton--primary",
      );
    }

    if (!nextAfterSelect) {
      return {
        success: false,
        error: "Could not find 'Next' button. DOM might have changed.",
      };
    }

    console.log("Clicking 'Next' button...");
    nextAfterSelect.focus();
    nextAfterSelect.click();

    // Wait for next window to load
    await new Promise((r) => setTimeout(r, 1500));

    // 7. Fill product name input (NEW STEP)
    console.log("Looking for product name input field...");

    // Try to find product name input field
    // Based on user feedback, the input might have aria-label="Product name" or class "TUXTextInputCore-input"
    let productNameInput = document.querySelector(
      'input[aria-label="Product name"], input[aria-label*="product name"], input[placeholder*="Product name"], .TUXTextInputCore-input',
    );

    if (productNameInput) {
      console.log(
        "Found product name input field, filling with cleaned product name...",
      );

      // Get the original product name from the selected row
      // We need to extract it from the targetRow we found earlier
      let originalProductName = "";
      if (targetRow) {
        // Try to find product name in the row (excluding the product ID)
        const rowText = targetRow.textContent || "";
        // Remove product ID from the text to get product name
        originalProductName = rowText.replace(productId, "").trim();

        // If we couldn't extract a good name, use a default
        if (!originalProductName || originalProductName.length < 2) {
          originalProductName = `Product ${productId}`;
        }
      } else {
        originalProductName = `Product ${productId}`;
      }

      // Clean the product name
      const finalProductName = cleanProductName(originalProductName);
      console.log(
        `Original: "${originalProductName}" -> Cleaned: "${finalProductName}"`,
      );

      // Fill the input field
      productNameInput.focus();

      // Use execCommand for React compatibility
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, finalProductName);

      // Fallback if execCommand fails
      if (productNameInput.value !== finalProductName) {
        productNameInput.value = finalProductName;
      }

      // IMPORTANT: Dispatch events to make React recognize the change
      productNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      productNameInput.dispatchEvent(new Event("change", { bubbles: true }));

      // Wait a bit for UI to update
      await new Promise((r) => setTimeout(r, 800));
    } else {
      console.warn("Could not find product name input field, continuing...");
    }

    // 8. Click "Add" on the final confirmation modal
    console.log("Waiting for confirmation modal to click final Add button...");

    // Wait for modal content to transition
    await new Promise((r) => setTimeout(r, 1500));

    let finalAddButton = null;

    // Find button with text "Add" specifically in the Modal Footer
    const footerButtons = Array.from(
      document.querySelectorAll(".common-modal-footer button"),
    );
    finalAddButton = footerButtons.find(
      (btn) =>
        (btn.textContent.trim() === "Add" || btn.innerText.trim() === "Add") &&
        btn.offsetParent !== null, // Ensure button is actually visible
    );

    // Fallback to Primary button in footer
    if (!finalAddButton) {
      finalAddButton = document.querySelector(
        ".common-modal-footer .TUXButton--primary",
      );
    }

    // Final validation before clicking
    if (!finalAddButton || !finalAddButton.textContent.includes("Add")) {
      return {
        success: false,
        error: "Could not find 'Add' button on final confirmation screen",
      };
    }

    console.log("Found final Add button, sending special click sequence...");

    finalAddButton.focus();

    // Simulate full mouse event chain for React/TUX compatibility
    const mouseEvents = ["mousedown", "mouseup", "click"];
    mouseEvents.forEach((type) => {
      finalAddButton.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    });

    console.log("Final Add button clicked successfully!");
    return {
      success: true,
      message: `Product added successfully`,
    };
  } catch (error) {
    console.error("Error adding product:", error);
    return { success: false, error: error.message };
  }
}

async function toggleAIContent() {
  try {
    console.log("Starting AI content toggle process...");

    // 1. Find AI content container
    let aiContainer = document.querySelector('[data-e2e="aigc_container"]');

    // Check if menu is hidden (not visible on screen or has hidden attribute)
    const isHidden =
      !aiContainer ||
      aiContainer.offsetParent === null ||
      aiContainer.closest("[hidden]") !== null;

    if (isHidden) {
      console.log("AI menu is hidden... clicking 'Show more'");

      // Find Show more button using advanced settings container (most accurate)
      const advContainer = document.querySelector(
        '[data-e2e="advanced_settings_container"]',
      );
      const showMoreBtn = advContainer?.querySelector(".more-btn");

      if (showMoreBtn) {
        showMoreBtn.click();
        console.log("Clicked 'Show more' button");

        // Wait for animation to complete
        await new Promise((r) => setTimeout(r, 1200));

        // Refresh container reference
        aiContainer = document.querySelector('[data-e2e="aigc_container"]');
      } else {
        // Fallback to text search if data-e2e fails
        const fallbackBtn = Array.from(
          document.querySelectorAll("div, span, button"),
        ).find((el) => el.textContent.trim().toLowerCase() === "show more");
        if (fallbackBtn) {
          fallbackBtn.click();
          await new Promise((r) => setTimeout(r, 1200));
          aiContainer = document.querySelector('[data-e2e="aigc_container"]');
        } else {
          return { success: false, error: "Could not find 'Show more' button" };
        }
      }
    }

    if (!aiContainer) {
      return {
        success: false,
        error: "Could not find AI menu even after expansion",
      };
    }

    // 2. Find the switch/toggle
    const toggleBtn = aiContainer.querySelector(
      '.Switch__content, [role="switch"]',
    );

    if (!toggleBtn) {
      return { success: false, error: "Could not find AI switch button" };
    }

    // 3. Check current state
    const isChecked =
      toggleBtn.getAttribute("aria-checked") === "true" ||
      toggleBtn.getAttribute("data-state") === "checked";

    if (isChecked) {
      console.log("AI content is already enabled");
      return { success: true, message: "AI content is already enabled" };
    }

    // 4. Click to enable
    console.log("Clicking to enable AI content...");
    toggleBtn.focus();
    toggleBtn.click();

    // Simulate mouse events for React compatibility
    toggleBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toggleBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    return { success: true, message: "AI content enabled successfully!" };
  } catch (error) {
    console.error("Error in toggleAIContent:", error);
    return { success: false, error: error.message };
  }
}

async function waitForProcessing() {
  console.log("Waiting for video processing...");

  // Look for processing indicators
  const processingIndicator = document.querySelector(
    '[data-e2e="processing"], .processing, [aria-label*="processing"]',
  );

  if (processingIndicator) {
    // Wait for processing to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const isProcessing = !!document.querySelector(
          '[data-e2e="processing"], .processing, [aria-label*="processing"]',
        );
        const isComplete = !!document.querySelector(
          '[data-e2e="complete"], .complete, [aria-label*="complete"]',
        );

        if (!isProcessing || isComplete) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  // Fallback: wait 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function clickPostButton() {
  try {
    console.log("Starting post/schedule button click process...");

    // 1. First try to find post button with data-e2e
    let postButton = null;
    const postCandidates = Array.from(
      document.querySelectorAll('[data-e2e="post_video_button"]'),
    );
    postButton = postCandidates.find((el) => el.offsetParent !== null);

    // 2. Check if button text is "Schedule" (when schedule time is set)
    if (postButton) {
      const buttonText = postButton.textContent.toLowerCase();
      console.log("Found post button with text:", buttonText);

      // Check if button says "Schedule" instead of "Post"
      if (buttonText.includes("schedule")) {
        console.log("Button is in schedule mode (text: Schedule)");
      }
    }

    // 3. If not found, look for schedule button by text
    if (!postButton) {
      console.log("Post button not found, looking for schedule button...");

      // Look for buttons with text containing "Schedule" (exact match for schedule mode)
      const allButtons = Array.from(document.querySelectorAll("button"));
      const scheduleButton = allButtons.find((btn) => {
        const text = btn.textContent.toLowerCase();
        return text.includes("schedule") && !text.includes("schedule for");
      });

      if (scheduleButton) {
        console.log("Found schedule button:", scheduleButton.textContent);
        postButton = scheduleButton;
      }
    }

    // 4. If still not found, look for any button with post/schedule text
    if (!postButton) {
      console.log("Looking for any post/schedule button by text...");
      const allButtons = Array.from(document.querySelectorAll("button"));
      const textButton = allButtons.find((btn) => {
        const text = btn.textContent.toLowerCase();
        return (
          text.includes("post") ||
          text.includes("schedule") ||
          text.includes("publish")
        );
      });

      if (textButton) {
        console.log("Found button by text:", textButton.textContent);
        postButton = textButton;
      }
    }

    if (!postButton) {
      return {
        success: false,
        error: "Could not find post/schedule button (check if video is loaded)",
      };
    }

    // 5. Check if button is locked/disabled
    const isLocked =
      postButton.disabled ||
      postButton.getAttribute("aria-disabled") === "true" ||
      postButton.getAttribute("data-disabled") === "true" ||
      postButton.classList.contains("Button--disabled");

    if (isLocked) {
      return {
        success: false,
        error:
          "Button is disabled (gray). Please wait for copyright check to complete.",
      };
    }

    // 6. Scroll and click
    postButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 400));

    postButton.focus();
    const mouseParams = { bubbles: true, cancelable: true, view: window };
    postButton.dispatchEvent(new MouseEvent("mousedown", mouseParams));
    postButton.dispatchEvent(new MouseEvent("mouseup", mouseParams));
    postButton.click();

    // Click inner content for safety
    const inner = postButton.querySelector(".Button__content");
    if (inner) inner.click();

    // 7. Check for confirmation popup (both "Continue to post?" and "Continue to schedule?")
    console.log("Checking for confirmation popup...");
    await new Promise((r) => setTimeout(r, 2000));

    const modalConfirm = document.querySelector(".common-modal-confirm-modal");
    if (
      modalConfirm &&
      (modalConfirm.textContent.includes("Continue to post?") ||
        modalConfirm.textContent.includes("Continue to schedule?"))
    ) {
      console.log("Found confirmation popup, clicking confirm button...");

      // Look for confirm button - check for both "Post now" and "Schedule now"
      const confirmButtons = Array.from(
        modalConfirm.querySelectorAll("button"),
      );

      // First try to find "Schedule now" (for schedule mode)
      let confirmButton = confirmButtons.find((btn) => {
        const text = btn.textContent.toLowerCase();
        return text.includes("schedule now");
      });

      // If not found, try "Post now" (for regular post mode)
      if (!confirmButton) {
        confirmButton = confirmButtons.find((btn) => {
          const text = btn.textContent.toLowerCase();
          return text.includes("post now");
        });
      }

      // If still not found, try generic confirm buttons
      if (!confirmButton) {
        confirmButton = confirmButtons.find((btn) => {
          const text = btn.textContent.toLowerCase();
          return text.includes("confirm") || text.includes("continue");
        });
      }

      if (confirmButton) {
        console.log(
          "Clicked confirm button in popup:",
          confirmButton.textContent,
        );
        confirmButton.click();
        return {
          success: true,
          message: "Clicked post/schedule button and confirmed in popup!",
        };
      }
    }

    return {
      success: true,
      message: "Clicked post/schedule button successfully!",
    };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: error.message };
  }
}

async function checkPostSuccessAndNotify() {
  console.log("Checking for post success...");
  const startTime = Date.now();
  const timeout = 60000; // 60 seconds timeout

  const checkInterval = setInterval(async () => {
    // Check for success indicators
    const successIndicators = [
      "Post successful",
      "Your video is being uploaded",
      "Manage your posts",
      "View post",
      "Post another video",
    ];

    const pageText = document.body.innerText;
    const isSuccess = successIndicators.some((indicator) =>
      pageText.includes(indicator),
    );

    // Check for redirect to content page
    const isContentPage = window.location.href.includes(
      "/tiktokstudio/content",
    );

    const successModal = document.querySelector(
      '.common-modal-confirm-modal, [class*="success"]',
    );
    const modalSuccess =
      successModal &&
      (successModal.textContent.includes("successful") ||
        successModal.textContent.includes("uploaded"));

    console.log(
      `Success check - isSuccess: ${isSuccess}, isContentPage: ${isContentPage}, modalSuccess: ${modalSuccess}, time elapsed: ${Date.now() - startTime}ms`,
    );

    if (
      isSuccess ||
      modalSuccess ||
      isContentPage ||
      Date.now() - startTime > timeout
    ) {
      clearInterval(checkInterval);

      if (isSuccess || modalSuccess || isContentPage) {
        console.log("Post success detected! Sending webhook...");

        // Get task ID from multiple possible sources
        let taskId =
          window.currentTaskId ||
          localStorage.getItem("tt_automator_last_task_id");

        // If no taskId found, try to get it from the URL or page context
        if (!taskId) {
          console.warn(
            "No task ID found in window or localStorage, checking other sources...",
          );

          // Try to extract from URL parameters
          const urlParams = new URLSearchParams(window.location.search);
          taskId = urlParams.get("taskId") || urlParams.get("id");

          // Try to find task ID in page content
          if (!taskId) {
            const pageContent = document.body.innerText;
            const taskIdMatch =
              pageContent.match(/task[_\s-]?id[:\s]+(\d+)/i) ||
              pageContent.match(/id[:\s]+(\d+)/i);
            if (taskIdMatch) {
              taskId = taskIdMatch[1];
            }
          }
        }

        console.log(`Task ID for webhook: ${taskId}`);

        if (taskId) {
          sendSuccessWebhook(
            taskId,
            isContentPage ? "redirect" : modalSuccess ? "modal" : "text",
          );
          // Clear task ID to prevent duplicate webhooks
          localStorage.removeItem("tt_automator_last_task_id");
          if (window.currentTaskId) {
            delete window.currentTaskId;
          }
        } else {
          console.error(
            "No task ID found for webhook! Sending error webhook...",
          );
          // Send error webhook with diagnostic info
          sendErrorWebhook("No task ID found when sending success webhook");
        }
      } else {
        console.log("Post success check timed out.");
      }
    }
  }, 2000);
}

// Function to send error webhook when taskId is not found
async function sendErrorWebhook(errorMessage) {
  const webhookUrl =
    "https://n8n.srv803794.hstgr.cloud/webhook/df76bbf9-ed7e-4f95-a62e-2495fe836c63";
  console.log(`Sending error webhook: ${errorMessage}`);

  try {
    chrome.runtime.sendMessage(
      {
        action: "FETCH_API",
        url: webhookUrl,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: errorMessage,
            status: "error",
            timestamp: new Date().toISOString(),
            url: window.location.href,
            diagnostic: {
              currentTaskId: window.currentTaskId,
              localStorageTaskId: localStorage.getItem(
                "tt_automator_last_task_id",
              ),
              userAgent: navigator.userAgent,
              pageTitle: document.title,
            },
          }),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending error webhook message to background:",
            chrome.runtime.lastError,
          );
          return;
        }

        console.log("Error webhook background response:", response);
      },
    );
  } catch (error) {
    console.error("Failed to send error webhook message:", error);
  }
}

// Note: Removed the old helper UI from TikTok page
// The status window is now in the extension popup instead

// Schedule function
async function setSchedule(hour, minute) {
  try {
    console.log(`Setting schedule: Time ${hour}:${minute}`);

    // 1. Click Schedule radio button
    const scheduleRadio = document.querySelector('input[value="schedule"]');
    if (!scheduleRadio) {
      return { success: false, message: "Schedule radio button not found" };
    }

    // Click the label or parent element
    const scheduleLabel = scheduleRadio.closest("label");
    if (scheduleLabel) {
      scheduleLabel.click();
    } else {
      scheduleRadio.click();
    }

    console.log("Selected Schedule mode");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Handle time selection
    const timeInputs = document.querySelectorAll(".TUXTextInputCore-input");

    // Find time input (contains ":")
    const timeInput = Array.from(timeInputs).find(
      (i) => i.value && i.value.includes(":"),
    );
    if (timeInput) {
      console.log("Found time input:", timeInput.value);
      timeInput.click();
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Select hour from left timepicker
      const hourItems = document.querySelectorAll(".tiktok-timepicker-left");
      const targetHourElement = Array.from(hourItems).find(
        (el) => el.innerText && el.innerText.trim() === hour,
      );

      if (targetHourElement) {
        targetHourElement.click();
        console.log(`Selected hour: ${hour}`);
      } else {
        console.warn(`Hour ${hour} not found in timepicker`);
      }

      // Select minute from right timepicker
      const minuteItems = document.querySelectorAll(".tiktok-timepicker-right");
      const targetMinuteElement = Array.from(minuteItems).find(
        (el) => el.innerText && el.innerText.trim() === minute,
      );

      if (targetMinuteElement) {
        targetMinuteElement.click();
        console.log(`Selected minute: ${minute}`);
      } else {
        console.warn(`Minute ${minute} not found in timepicker`);
      }

      // Click outside to close timepicker
      document.body.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      console.warn("Time input not found");
    }

    console.log("Schedule automation completed successfully");
    return {
      success: true,
      message: `Schedule set for ${hour}:${minute}`,
    };
  } catch (error) {
    console.error("Error in schedule automation:", error);
    return { success: false, message: error.message };
  }
}

// Export functions for manual testing
window.TikTokAutomator = {
  checkLoginStatus,
  getPageInfo,
  uploadVideo,
  setCaption,
  addProduct,
  clickPostButton,
  setSchedule,
};
