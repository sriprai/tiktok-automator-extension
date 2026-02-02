// TikTok Video Automator Chrome Extension
// Content script for TikTok.com

console.log("TikTok Automator content script loaded");

// Check if we just redirected from a post
if (window.location.href.includes("/tiktokstudio/content")) {
  const lastTaskId = localStorage.getItem("tt_automator_last_task_id");
  if (lastTaskId) {
    console.log("Detected redirect to content page for task:", lastTaskId);
    sendSuccessWebhook(lastTaskId, "redirect_on_load");
    // Clear it so we don't send multiple times
    localStorage.removeItem("tt_automator_last_task_id");
  }
}

async function sendSuccessWebhook(taskId, method) {
  const webhookUrl =
    "https://n8n.srv803794.hstgr.cloud/webhook/df76bbf9-ed7e-4f95-a62e-2495fe836c63";
  console.log(`Sending success webhook for task ${taskId} via ${method}...`);

  try {
    chrome.runtime.sendMessage(
      {
        action: "FETCH_API",
        url: webhookUrl,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: taskId,
            status: "success",
            timestamp: new Date().toISOString(),
            url: window.location.href,
            detectionMethod: method,
          }),
        },
      },
      (response) => {
        console.log("Webhook background response:", response);
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
    clickPostButton().then(sendResponse);
    return true;
  }

  if (message.action === "TOGGLE_AI_CONTENT") {
    toggleAIContent().then(sendResponse);
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

async function waitForElement(selector, timeout = 10000) {
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

      setTimeout(checkElement, 100);
    };

    checkElement();
  });
}

async function uploadVideo(videoUrl) {
  try {
    console.log("Uploading video from URL:", videoUrl);

    // Find file input
    const fileInput = await waitForElement('input[type="file"]');
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

    // 7. Click "Add" on the final confirmation modal
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
    console.log("เริ่มกระบวนการคลิกปุ่ม Post...");

    // 1. หาปุ่มจาก data-e2e ตรงๆ
    const candidates = Array.from(
      document.querySelectorAll('[data-e2e="post_video_button"]'),
    );
    let postButton = candidates.find((el) => el.offsetParent !== null);

    if (!postButton) {
      return {
        success: false,
        error: "หาปุ่ม Post ไม่เจอ (ลองตรวจสอบว่าวิดีโอโหลดเสร็จหรือยัง)",
      };
    }

    // 2. เช็คว่าปุ่มล็อคอยู่ไหม (สำคัญมาก: ถ้าติ๊ก Copyright Check อยู่ ต้องรอให้มันเขียวถึงจะกดได้)
    const isLocked =
      postButton.disabled ||
      postButton.getAttribute("aria-disabled") === "true" ||
      postButton.getAttribute("data-disabled") === "true" ||
      postButton.classList.contains("Button--disabled");

    if (isLocked) {
      return {
        success: false,
        error:
          "ปุ่มยังเป็นสีเทา (Disabled) ลองรอให้ระบบเช็คลิขสิทธิ์ (Copyright) ให้เสร็จก่อนครับ",
      };
    }

    // 3. เลื่อนหน้าจอและคลิก
    postButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 400));

    postButton.focus();
    const mouseParams = { bubbles: true, cancelable: true, view: window };
    postButton.dispatchEvent(new MouseEvent("mousedown", mouseParams));
    postButton.dispatchEvent(new MouseEvent("mouseup", mouseParams));
    postButton.click();

    // คลิกตัวเนื้อหาข้างในด้วยเพื่อความชัวร์
    const inner = postButton.querySelector(".Button__content");
    if (inner) inner.click();

    // 4. ตรวจสอบ Popup "Continue to post?" (ถ้ามี)
    console.log("กำลังตรวจสอบ Popup ยืนยันการโพสต์...");
    await new Promise((r) => setTimeout(r, 2000)); // รอให้ Popup ปรากฏ

    const modalConfirm = document.querySelector(".common-modal-confirm-modal");
    if (
      modalConfirm &&
      modalConfirm.textContent.includes("Continue to post?")
    ) {
      console.log("พบ Popup 'Continue to post?', กำลังคลิก 'Post now'...");
      const postNowButton = Array.from(
        modalConfirm.querySelectorAll("button"),
      ).find((btn) => btn.textContent.includes("Post now"));

      if (postNowButton) {
        postNowButton.click();
        console.log("คลิกปุ่ม 'Post now' ใน Popup เรียบร้อยแล้ว");
        return {
          success: true,
          message: "คลิกปุ่ม Post และยืนยันใน Popup เรียบร้อยแล้ว!",
        };
      }
    }

    // 5. ตรวจสอบความสำเร็จและส่ง Webhook
    checkPostSuccessAndNotify();

    return { success: true, message: "คลิกปุ่ม Post เรียบร้อยแล้ว!" };
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

    if (
      isSuccess ||
      modalSuccess ||
      isContentPage ||
      Date.now() - startTime > timeout
    ) {
      clearInterval(checkInterval);

      if (isSuccess || modalSuccess || isContentPage) {
        console.log("Post success detected! Sending webhook...");
        const taskId =
          window.currentTaskId ||
          localStorage.getItem("tt_automator_last_task_id");

        if (taskId) {
          sendSuccessWebhook(
            taskId,
            isContentPage ? "redirect" : modalSuccess ? "modal" : "text",
          );
          // Clear task ID to prevent duplicate webhooks
          localStorage.removeItem("tt_automator_last_task_id");
        }
      } else {
        console.log("Post success check timed out.");
      }
    }
  }, 2000);
}

// Note: Removed the old helper UI from TikTok page
// The status window is now in the extension popup instead

// Export functions for manual testing
window.TikTokAutomator = {
  checkLoginStatus,
  getPageInfo,
  uploadVideo,
  setCaption,
  addProduct,
  clickPostButton,
};
