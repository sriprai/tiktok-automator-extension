// TikTok Video Automator Chrome Extension
// Main popup functionality

// Configuration
const API_BASE_URL = "https://www.automatorx.co"; // Change to your production URL
const STORAGE_KEYS = {
  USER: "tiktok_automator_user",
  TOKEN: "tiktok_automator_token",
  LAST_SYNC: "tiktok_automator_last_sync",
};

// Premium plans that can use premium features
const PREMIUM_PLANS = ["pro", "ultra", "vip"];

// State
let currentUser = null;
let videos = [];
let products = [];
let accounts = [];
let currentPostMode = "manual-post"; // "manual-post", "manual-schedule", "auto-post", "auto-schedule"

// DOM Elements
const userInfoEl = document.getElementById("userInfo");
const creditsInfoEl = document.getElementById("creditsInfo");
const loginContainerEl = document.getElementById("loginContainer");
const videosGridEl = document.getElementById("videosGrid");
const videosLoadingEl = document.getElementById("videosLoading");
const videosEmptyEl = document.getElementById("videosEmpty");
const productsTableEl = document.getElementById("productsTable");
const productsBodyEl = document.getElementById("productsBody");
const productsLoadingEl = document.getElementById("productsLoading");
const productsEmptyEl = document.getElementById("productsEmpty");
const accountsListEl = document.getElementById("accountsList");
const accountsLoadingEl = document.getElementById("accountsLoading");
const accountsEmptyEl = document.getElementById("accountsEmpty");
const accountFilterEl = document.getElementById("accountFilter");
const uploadStatusWindowEl = document.getElementById("uploadStatusWindow");
const uploadStatusCloseEl = document.getElementById("uploadStatusClose");
const uploadStatusBadgeEl = document.getElementById("uploadStatusBadge");
const uploadStatusUrlEl = document.getElementById("uploadStatusUrl");
let videoTypeFilter = "all"; // "all", "Showcase", "Video Viral "

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await checkAuth();
  if (currentUser) {
    await loadAllData();
  }

  // Start periodic check for upload page status
  startUploadPageStatusChecker();

  // Start periodic sync for credits
  startCreditsSync();
});

// Event Listeners
function setupEventListeners() {
  // Video type tabs (main navigation)
  document.querySelectorAll(".video-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const videoType = btn.dataset.videoType;
      switchVideoType(videoType);
    });
  });

  // Refresh button
  document
    .getElementById("refreshVideos")
    .addEventListener("click", () => loadVideos());

  // Account filter
  if (accountFilterEl) {
    accountFilterEl.addEventListener("change", () => renderVideos());
  }

  // Login actions
  document.getElementById("openWebApp").addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: `${API_BASE_URL}/dashboard` });
    } else {
      // Fallback for testing in browser
      window.open(`${API_BASE_URL}/dashboard`, "_blank");
    }
  });

  document.getElementById("checkLogin").addEventListener("click", async () => {
    // Show loading state
    const checkLoginBtn = document.getElementById("checkLogin");
    const originalHTML = checkLoginBtn.innerHTML;
    checkLoginBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Checking...';
    checkLoginBtn.disabled = true;

    try {
      // Clear cached user data to force fresh login check
      await clearUserStorage();

      // Try to check auth with force refresh
      const isAuthenticated = await checkAuth(true); // Force fresh check

      if (isAuthenticated && currentUser) {
        await loadAllData();
        console.log("Login check successful for user:", currentUser.email);
      } else {
        console.log("No user logged in or authentication failed");
        // Show login container if not already shown
        showLoginContainer();
      }
    } catch (error) {
      console.error("Error during login check:", error);
      // Show login container on error
      showLoginContainer();
    } finally {
      // Restore button state
      checkLoginBtn.innerHTML = originalHTML;
      checkLoginBtn.disabled = false;
    }
  });

  // Manual login button
  document.getElementById("manualLoginBtn").addEventListener("click", () => {
    showManualLoginModal();
  });

  // Logout button
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await logout();
  });

  // Video player close button
  document.getElementById("videoPlayerClose").addEventListener("click", () => {
    hideVideoPlayer();
  });

  // Close video player when clicking outside
  document.getElementById("videoPlayerModal").addEventListener("click", (e) => {
    if (e.target.id === "videoPlayerModal") {
      hideVideoPlayer();
    }
  });

  // Close video player with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideVideoPlayer();
    }
  });

  // Upload status window close button
  if (uploadStatusCloseEl) {
    uploadStatusCloseEl.addEventListener("click", () => {
      hideUploadStatusWindow();
    });
  }

  // Post mode toggle buttons
  setupPostModeToggleListeners();

  // Bulk controls
  const selectAllVideos = document.getElementById("selectAllVideos");
  if (selectAllVideos) {
    selectAllVideos.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll(".video-bulk-checkbox");
      checkboxes.forEach((cb) => (cb.checked = e.target.checked));
    });
  }

  const startBulkPostBtn = document.getElementById("startBulkPost");
  if (startBulkPostBtn) {
    startBulkPostBtn.addEventListener("click", handleStartBulkPost);
  }

  const stopBulkPostBtn = document.getElementById("stopBulkPost");
  if (stopBulkPostBtn) {
    stopBulkPostBtn.addEventListener("click", handleStopBulkPost);
  }
}

// Video Type Management
function switchVideoType(videoType) {
  videoTypeFilter = videoType;

  // Update active video type button
  document.querySelectorAll(".video-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.videoType === videoType);
  });

  // Re-render videos with new filter
  renderVideos();
}

// Authentication
async function checkAuth(forceRefresh = false) {
  try {
    console.log(`Starting auth check (forceRefresh: ${forceRefresh})`);

    // If force refresh is requested, clear storage first
    if (forceRefresh) {
      await clearUserStorage();
    }

    // Try to get user from storage first (unless force refresh)
    if (!forceRefresh) {
      const storedUser = await getFromStorage(STORAGE_KEYS.USER);
      if (storedUser) {
        currentUser = storedUser;
        updateUserUI();
        hideLoginContainer();
        console.log("User loaded from storage:", currentUser.email);
        return true;
      }
    }

    // Try multiple methods to get user data
    const authMethods = [
      { name: "webAppMessage", func: getUserFromWebAppMessage },
      { name: "webAppCookies", func: getUserFromWebAppCookies },
      { name: "directApiWithCookies", func: getUserFromDirectApiWithCookies },
    ];

    for (const method of authMethods) {
      try {
        console.log(`Trying auth method: ${method.name}`);
        const user = await method.func();
        if (user) {
          currentUser = user;
          await saveToStorage(STORAGE_KEYS.USER, currentUser);
          updateUserUI();
          hideLoginContainer();
          console.log(`Auth successful via ${method.name}:`, user.email);
          return true;
        }
      } catch (error) {
        console.log(`Auth method ${method.name} failed:`, error.message);
      }
    }

    // All methods failed
    console.log("All auth methods failed, showing login container");
    showLoginContainer();
    return false;
  } catch (error) {
    console.error("Auth check failed:", error);
    showLoginContainer();
    return false;
  }
}

// Method 1: Get user from web app via message passing
async function getUserFromWebAppMessage() {
  try {
    const userId = await getUserIdFromWebApp();
    if (!userId) {
      throw new Error("No user ID from web app");
    }

    // Try to fetch user data with the user ID
    const response = await fetchWithAuth(`${API_BASE_URL}/api/auth/me`);

    if (response.ok) {
      const data = await response.json();
      return data.user;
    } else {
      throw new Error(`API response not OK: ${response.status}`);
    }
  } catch (error) {
    throw new Error(`Web app message method failed: ${error.message}`);
  }
}

// Method 2: Get user from web app cookies
async function getUserFromWebAppCookies() {
  return new Promise((resolve, reject) => {
    // Get cookies from automatorx.co
    chrome.cookies.getAll({ url: API_BASE_URL }, (cookies) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Look for user-related cookies
      const userCookies = cookies.filter(
        (cookie) =>
          cookie.name.includes("user") ||
          cookie.name.includes("auth") ||
          cookie.name.includes("session"),
      );

      if (userCookies.length === 0) {
        reject(new Error("No user cookies found"));
        return;
      }

      console.log(`Found ${userCookies.length} user cookies`);

      // Try to extract user ID from cookies
      let userId = null;
      for (const cookie of userCookies) {
        try {
          // Check if cookie value is JSON
          const parsed = JSON.parse(cookie.value);
          if (parsed.id || parsed.userId) {
            userId = parsed.id || parsed.userId;
            break;
          }
        } catch {
          // Not JSON, check if it's a simple ID
          if (cookie.value.match(/^\d+$/)) {
            userId = cookie.value;
            break;
          }
        }
      }

      if (!userId) {
        reject(new Error("Could not extract user ID from cookies"));
        return;
      }

      // Fetch user data with the extracted ID
      fetchWithAuth(`${API_BASE_URL}/api/auth/me`)
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error(`API response not OK: ${response.status}`);
          }
        })
        .then((data) => resolve(data.user))
        .catch(reject);
    });
  });
}

// Method 3: Direct API call with cookie-based authentication
async function getUserFromDirectApiWithCookies() {
  // This method tries to make a direct API call that might work
  // if the user is logged into the web app in the same browser
  const response = await fetchWithAuth(`${API_BASE_URL}/api/auth/me`);

  if (response.ok) {
    const data = await response.json();
    return data.user;
  } else {
    throw new Error(`Direct API failed: ${response.status}`);
  }
}

// Plan checking functions
function hasPremiumPlan() {
  if (!currentUser) return false;

  // Check if user has a plan field
  const userPlan =
    currentUser.plan || currentUser.subscription_plan || currentUser.tier;

  if (!userPlan) {
    // If no plan field exists, assume free tier
    return false;
  }

  // Check if plan is in premium plans (case-insensitive)
  const planLower = userPlan.toLowerCase().trim();
  return PREMIUM_PLANS.some(
    (premiumPlan) => planLower === premiumPlan.toLowerCase(),
  );
}

function showPlanUpgradeMessage() {
  // Create a modal or alert to show upgrade message
  const message = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    ">
      <div style="
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        width: 100%;
        border: 1px solid #475569;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        text-align: center;
      ">
        <div style="
          font-size: 48px;
          margin-bottom: 20px;
          color: #8b5cf6;
        ">
          ⭐
        </div>
        <h2 style="
          color: #f1f5f9;
          font-size: 24px;
          margin-bottom: 16px;
          font-weight: 600;
        ">
          Premium Feature Required
        </h2>
        <p style="
          color: #94a3b8;
          line-height: 1.6;
          margin-bottom: 24px;
          font-size: 16px;
        ">
          This feature is only available for Pro, Ultra, or VIP plan members.
          Upgrade your plan to unlock premium automation features and enhance your TikTok workflow.
        </p>
        <div style="
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 24px;
        ">
          <button id="upgradePlanBtn" style="
            padding: 12px 24px;
            background: linear-gradient(90deg, #8b5cf6 0%, #06b6d4 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            Upgrade Plan
          </button>
          <button id="closePlanMessageBtn" style="
            padding: 12px 24px;
            background: rgba(30, 41, 59, 0.7);
            color: #cbd5e1;
            border: 1px solid #475569;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  // Create and append the modal
  const modal = document.createElement("div");
  modal.innerHTML = message;
  modal.id = "planUpgradeModal";
  document.body.appendChild(modal);

  // Add event listeners
  document.getElementById("upgradePlanBtn").addEventListener("click", () => {
    // Open web app upgrade page
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({
        url: "https://www.automatorx.co/dashboard/billing",
      });
    } else {
      window.open("https://www.automatorx.co/dashboard/billing", "_blank");
    }
    // Remove modal
    document.body.removeChild(modal);
  });

  document
    .getElementById("closePlanMessageBtn")
    .addEventListener("click", () => {
      document.body.removeChild(modal);
    });

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function checkPremiumFeatureAccess(featureName = "this feature") {
  if (!hasPremiumPlan()) {
    showPlanUpgradeMessage();
    return false;
  }
  return true;
}

function updateUserUI() {
  if (!currentUser) return;

  // Get user display name - try multiple possible fields
  const userName =
    currentUser.name ||
    currentUser.username ||
    currentUser.full_name ||
    currentUser.display_name ||
    "User";
  const userEmail =
    currentUser.email || currentUser.email_address || "No email";

  // Get first character for avatar
  const avatarChar = userName.charAt(0).toUpperCase();

  // Get user plan
  const userPlan =
    currentUser.plan ||
    currentUser.subscription_plan ||
    currentUser.tier ||
    "Free";
  const isPremium = hasPremiumPlan();

  // Create plan badge
  const planBadge = isPremium
    ? `<span class="plan-badge premium" title="Premium Plan">${userPlan}</span>`
    : `<span class="plan-badge free" title="Free Plan">${userPlan}</span>`;

  // Update user info
  userInfoEl.innerHTML = `
        <div class="logged-in">
            <div class="avatar">${avatarChar}</div>
            <div class="user-details">
                <div class="email">${userEmail}</div>
                <div class="plan-info">${planBadge}</div>
            </div>
        </div>
    `;

  // Update credits
  const userCredits = currentUser.credits || currentUser.credit_balance || 0;
  creditsInfoEl.innerHTML = `
        <i class="fas fa-coins"></i>
        <span>${userCredits} credits</span>
    `;

  // Show logout button
  document.getElementById("logoutBtn").style.display = "flex";

  console.log("User UI updated:", {
    userName,
    userEmail,
    userCredits,
    userPlan,
    isPremium,
  });
}

function showLoginContainer() {
  loginContainerEl.style.display = "flex";
  document.querySelector(".main-content").style.display = "none";
  document.querySelector(".video-type-tabs.main-tabs").style.display = "none";

  // Hide logout button when showing login container
  document.getElementById("logoutBtn").style.display = "none";
}

function hideLoginContainer() {
  loginContainerEl.style.display = "none";
  document.querySelector(".main-content").style.display = "block";
  document.querySelector(".video-type-tabs.main-tabs").style.display = "flex";
}

// Data Loading
async function loadAllData() {
  await Promise.all([loadVideos(), loadProducts(), loadAccounts()]);
}

async function loadVideos() {
  if (!currentUser) return;

  showLoading("videos");

  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/video-tasks`);

    if (response.ok) {
      const data = await response.json();
      videos = data.tasks || [];
      renderVideos();
    } else {
      showEmptyState("videos", "Failed to load videos");
    }
  } catch (error) {
    console.error("Error loading videos:", error);
    showEmptyState("videos", "Error loading videos");
  }
}

async function loadProducts() {
  if (!currentUser) return;

  showLoading("products");

  try {
    // Note: You'll need to create a products API endpoint
    // For now, we'll extract products from videos
    const productsFromVideos = extractProductsFromVideos();
    products = productsFromVideos;
    renderProducts();
  } catch (error) {
    console.error("Error loading products:", error);
    showEmptyState("products", "Error loading products");
  }
}

async function loadAccounts() {
  if (!currentUser) return;

  showLoading("accounts");

  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/tiktok/accounts`);

    if (response.ok) {
      const data = await response.json();
      accounts = data.accounts || [];
      renderAccounts();
    } else {
      showEmptyState("accounts", "Failed to load accounts");
    }
  } catch (error) {
    console.error("Error loading accounts:", error);
    showEmptyState("accounts", "Error loading accounts");
  }
}

// Rendering
function renderVideos() {
  if (!videos.length) {
    showEmptyState("videos", "No videos found");
    return;
  }

  const accountFilter = accountFilterEl ? accountFilterEl.value : "all";
  let filteredVideos = videos;

  // Always filter by "Ready to Post" status
  filteredVideos = filteredVideos.filter(
    (video) => video.status === "Ready to Post",
  );

  // Apply account filter
  if (accountFilter !== "all") {
    filteredVideos = filteredVideos.filter((video) => {
      // Check if video has a tiktok_id that matches the filter
      const videoTikTokId = video.tiktok_id;
      return videoTikTokId && videoTikTokId.toString() === accountFilter;
    });
  }

  // Apply video type filter
  if (videoTypeFilter !== "all") {
    filteredVideos = filteredVideos.filter((video) => {
      const videoType = video.video_type || "Showcase";

      // Handle different possible values for viral videos
      if (videoTypeFilter === "video viral") {
        // Check for various possible viral video type values
        const videoTypeLower = videoType.toLowerCase();
        return (
          videoTypeLower.includes("viral") ||
          videoTypeLower === "video viral" ||
          videoTypeLower === "viral video" ||
          videoTypeLower === "viral" ||
          videoTypeLower === "viral-video" ||
          videoTypeLower === "video_viral" ||
          videoTypeLower === "viral_video" ||
          videoTypeLower.includes("viral video") ||
          videoTypeLower.includes("video viral")
        );
      }

      // For Showcase, handle variations
      if (videoTypeFilter === "Showcase") {
        const videoTypeLower = videoType.toLowerCase();
        return (
          videoTypeLower === "showcase" ||
          videoTypeLower.includes("showcase") ||
          videoType === "Showcase"
        );
      }

      // For other types, do case-insensitive match
      return videoType.toLowerCase() === videoTypeFilter.toLowerCase();
    });
  }

  if (!filteredVideos.length) {
    showEmptyState(
      "videos",
      `No ${videoTypeFilter === "all" ? "" : videoTypeFilter + " "}Ready to Post videos found`,
    );
    return;
  }

  hideLoading("videos");
  videosEmptyEl.style.display = "none";
  videosGridEl.innerHTML = "";

  filteredVideos.forEach((video) => {
    const videoCard = createVideoCard(video);
    videosGridEl.appendChild(videoCard);
  });

  // Update checkbox visibility based on current mode
  updateCheckboxVisibility();
}

function updateCheckboxVisibility() {
  const checkboxes = document.querySelectorAll(".video-checkbox-container");
  const isBulkMode =
    currentPostMode === "auto-post" || currentPostMode === "auto-schedule";
  checkboxes.forEach((cb) => {
    cb.style.display = isBulkMode ? "flex" : "none";
  });
}

function createVideoCard(video) {
  const card = document.createElement("div");
  card.className = "video-card";

  const statusClass = getStatusClass(video.status);
  const thumbnailUrl = getVideoThumbnail(video);
  const formattedDate = formatDate(video.created_at);
  const videoUrl = video.complete_video || video.video_url;
  const isPlayable =
    videoUrl &&
    (video.status === "Ready to Post" || video.status === "Posted to Tiktok");
  const caption = video.tone || `${video.title} - ${video.price}`;

  // Check if video has a valid product ID
  const hasProductId =
    video.product_id &&
    video.product_id !== "manual" &&
    video.product_id !== "none" &&
    video.product_id.trim() !== "";

  // Determine which elements to show based on current post mode
  const showManualPostElements = currentPostMode === "manual-post";
  const showAutoPostElements = currentPostMode === "auto-post";
  const showManualScheduleElements = currentPostMode === "manual-schedule";
  const showAutoScheduleElements = currentPostMode === "auto-schedule";

  // Get current time for default schedule values
  const now = new Date();
  const currentHour = now.getHours().toString().padStart(2, "0");
  const currentMinute = Math.floor(now.getMinutes() / 5) * 5; // Round to nearest 5 minutes
  const currentMinuteStr = currentMinute.toString().padStart(2, "0");

  // Build the video actions HTML based on post mode
  let videoActionsHTML = "";

  if (showManualPostElements) {
    // Manual Post: Show icons and Post Now button, hide Auto Post button
    videoActionsHTML = `
      <div class="tooltip-container">
        <button class="action-btn icon-only upload-btn" data-video-id="${video.id}" data-video-url="${videoUrl || ""}" data-caption="${caption}" title="Upload">
            <i class="fas fa-upload"></i>
        </button>
        <span class="tooltip-text">Upload</span>
      </div>
      <div class="tooltip-container">
        <button class="action-btn icon-only caption-btn" data-caption="${caption}" title="Caption">
            <i class="fas fa-font"></i>
        </button>
        <span class="tooltip-text">Caption</span>
      </div>
      ${
        hasProductId
          ? `
      <div class="tooltip-container">
        <button class="action-btn icon-only product-id-btn" data-product-id="${video.product_id}" title="Product ID">
            <i class="fas fa-tag"></i>
        </button>
        <span class="tooltip-text">Product ID</span>
      </div>
      `
          : ""
      }
      <div class="tooltip-container">
        <button class="action-btn icon-only ai-content-btn" title="AI Content">
            <i class="fas fa-robot"></i>
        </button>
        <span class="tooltip-text">AI Content</span>
      </div>
      <button class="action-btn post-tiktok-btn" data-video-id="${video.id}" title="Post Now">
          <i class="fab fa-tiktok"></i> Post Now
          <div class="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-sm ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins h-4 w-4 text-yellow-500" aria-hidden="true">
                  <circle cx="8" cy="8" r="6"></circle>
                  <path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path>
                  <path d="M7 6h1v4"></path>
                  <path d="m16.71 13.88.7.71-2.82 2.82"></path>
              </svg>
              0
          </div>
      </button>
    `;
  } else if (showAutoPostElements) {
    // Auto Post: Hide all icons, just show Auto Post button
    videoActionsHTML = `
      <button class="action-btn auto-post-btn" data-video-id="${video.id}" data-video-url="${videoUrl || ""}" data-caption="${caption}" data-product-id="${video.product_id || ""}" title="Auto Post">
          <i class="fas fa-bolt"></i> Auto Post
          <div class="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-sm ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins h-4 w-4 text-yellow-500" aria-hidden="true">
                  <circle cx="8" cy="8" r="6"></circle>
                  <path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path>
                  <path d="M7 6h1v4"></path>
                  <path d="m16.71 13.88.7.71-2.82 2.82"></path>
              </svg>
              5
          </div>
      </button>
    `;
  } else if (showManualScheduleElements) {
    // Manual Schedule: Show all icons, add time selection, and Post Now button (same as manual post)
    videoActionsHTML = `
      <div class="tooltip-container">
        <button class="action-btn icon-only upload-btn" data-video-id="${video.id}" data-video-url="${videoUrl || ""}" data-caption="${caption}" title="Upload">
            <i class="fas fa-upload"></i>
        </button>
        <span class="tooltip-text">Upload</span>
      </div>
      <div class="tooltip-container">
        <button class="action-btn icon-only caption-btn" data-caption="${caption}" title="Caption">
            <i class="fas fa-font"></i>
        </button>
        <span class="tooltip-text">Caption</span>
      </div>
      ${
        hasProductId
          ? `
      <div class="tooltip-container">
        <button class="action-btn icon-only product-id-btn" data-product-id="${video.product_id}" title="Product ID">
            <i class="fas fa-tag"></i>
        </button>
        <span class="tooltip-text">Product ID</span>
      </div>
      `
          : ""
      }
      <div class="tooltip-container">
        <button class="action-btn icon-only ai-content-btn" title="AI Content">
            <i class="fas fa-robot"></i>
        </button>
        <span class="tooltip-text">AI Content</span>
      </div>
      
      <!-- Schedule Time Selection -->
      <div class="schedule-time-selection" style="width: 100%; margin-top: 8px; margin-bottom: 8px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%); padding: 8px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); box-sizing: border-box;">
        <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px; text-align: center; font-weight: 500;">Schedule Time</div>
        <div style="display: flex; gap: 4px; justify-content: center; align-items: center; width: 100%;">
          <div style="flex: 1; position: relative; min-width: 0;">
            <select class="schedule-hour-select" data-video-id="${video.id}" style="width: 100%; padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.4); background: rgba(15, 23, 42, 0.9); color: #f1f5f9; font-size: 10px; font-weight: 500; appearance: none; cursor: pointer; transition: all 0.2s; box-sizing: border-box;">
              <option value="">Hour</option>
              ${Array.from({ length: 24 }, (_, i) => {
                const hour = i.toString().padStart(2, "0");
                const selected = hour === currentHour ? " selected" : "";
                return `<option value="${hour}"${selected}>${hour}</option>`;
              }).join("")}
            </select>
            <div style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8; font-size: 9px;">▼</div>
          </div>
          <div style="color: #64748b; font-size: 10px; font-weight: bold; flex-shrink: 0;">:</div>
          <div style="flex: 1; position: relative; min-width: 0;">
            <select class="schedule-minute-select" data-video-id="${video.id}" style="width: 100%; padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.4); background: rgba(15, 23, 42, 0.9); color: #f1f5f9; font-size: 10px; font-weight: 500; appearance: none; cursor: pointer; transition: all 0.2s; box-sizing: border-box;">
              <option value="">Minute</option>
              ${Array.from({ length: 12 }, (_, i) => {
                const minute = (i * 5).toString().padStart(2, "0");
                const selected = minute === currentMinuteStr ? " selected" : "";
                return `<option value="${minute}"${selected}>${minute}</option>`;
              }).join("")}
            </select>
            <div style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8; font-size: 9px;">▼</div>
          </div>
        </div>
        <div style="display: flex; gap: 4px; margin-top: 6px; width: 100%;">
          <button class="action-btn set-schedule-btn" data-video-id="${video.id}" style="flex: 1; padding: 6px; font-size: 10px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.3) 100%); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; font-weight: 500; transition: all 0.2s; cursor: pointer; box-sizing: border-box;">
            <i class="fas fa-calendar-plus" style="margin-right: 3px;"></i> Set Schedule
          </button>
        </div>
      </div>
      
      <!-- Post Now Button (same as manual post mode) -->
      <button class="action-btn post-tiktok-btn" data-video-id="${video.id}" title="Post Now" style="margin-top: 8px; width: 100%;">
          <i class="fab fa-tiktok"></i> Post Now
          <div class="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-sm ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins h-4 w-4 text-yellow-500" aria-hidden="true">
                  <circle cx="8" cy="8" r="6"></circle>
                  <path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path>
                  <path d="M7 6h1v4"></path>
                  <path d="m16.71 13.88.7.71-2.82 2.82"></path>
              </svg>
              0
          </div>
      </button>
    `;
  } else if (showAutoScheduleElements) {
    // Auto Schedule: Show time selection and Auto Schedule button (no Set Schedule button needed)
    videoActionsHTML = `
      <!-- Schedule Time Selection -->
      <div class="schedule-time-selection" style="width: 100%; margin-top: 8px; margin-bottom: 8px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%); padding: 8px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); box-sizing: border-box;">
        <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px; text-align: center; font-weight: 500;">Schedule Time</div>
        <div style="display: flex; gap: 4px; justify-content: center; align-items: center; width: 100%;">
          <div style="flex: 1; position: relative; min-width: 0;">
            <select class="schedule-hour-select" data-video-id="${video.id}" style="width: 100%; padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.4); background: rgba(15, 23, 42, 0.9); color: #f1f5f9; font-size: 10px; font-weight: 500; appearance: none; cursor: pointer; transition: all 0.2s; box-sizing: border-box;">
              <option value="">Hour</option>
              ${Array.from({ length: 24 }, (_, i) => {
                const hour = i.toString().padStart(2, "0");
                const selected = hour === currentHour ? " selected" : "";
                return `<option value="${hour}"${selected}>${hour}</option>`;
              }).join("")}
            </select>
            <div style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8; font-size: 9px;">▼</div>
          </div>
          <div style="color: #64748b; font-size: 10px; font-weight: bold; flex-shrink: 0;">:</div>
          <div style="flex: 1; position: relative; min-width: 0;">
            <select class="schedule-minute-select" data-video-id="${video.id}" style="width: 100%; padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.4); background: rgba(15, 23, 42, 0.9); color: #f1f5f9; font-size: 10px; font-weight: 500; appearance: none; cursor: pointer; transition: all 0.2s; box-sizing: border-box;">
              <option value="">Minute</option>
              ${Array.from({ length: 12 }, (_, i) => {
                const minute = (i * 5).toString().padStart(2, "0");
                const selected = minute === currentMinuteStr ? " selected" : "";
                return `<option value="${minute}"${selected}>${minute}</option>`;
              }).join("")}
            </select>
            <div style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8; font-size: 9px;">▼</div>
          </div>
        </div>
      </div>
      
      <!-- Auto Schedule Button (same as Auto Post style) -->
      <button class="action-btn auto-schedule-btn" data-video-id="${video.id}" data-video-url="${videoUrl || ""}" data-caption="${caption}" data-product-id="${video.product_id || ""}" title="Auto Schedule" style="margin-top: 8px; width: 100%;">
          <i class="fas fa-bolt"></i> Auto Post
          <div class="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-sm ml-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins h-4 w-4 text-yellow-500" aria-hidden="true">
                  <circle cx="8" cy="8" r="6"></circle>
                  <path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path>
                  <path d="M7 6h1v4"></path>
                  <path d="m16.71 13.88.7.71-2.82 2.82"></path>
              </svg>
              5
          </div>
      </button>
    `;
  } else {
    // Fallback for unknown modes
    videoActionsHTML = `
      <div class="video-actions-placeholder">
        <p style="font-size: 10px; color: #94a3b8; text-align: center; padding: 8px;">
          Actions hidden for ${currentPostMode.replace("-", " ")} mode
        </p>
      </div>
    `;
  }

  card.innerHTML = `
        <div class="video-checkbox-container">
          <input type="checkbox" class="video-bulk-checkbox" data-video-id="${video.id}" />
        </div>
        <div class="video-thumbnail">
            <img src="${thumbnailUrl}" alt="${video.title || "Video"}">
            ${isPlayable ? '<div class="play-icon-overlay"><i class="fas fa-play-circle"></i></div>' : ""}
            <div class="status-badge ${statusClass}">${getStatusText(video.status)}</div>
        </div>
        <div class="video-info">
            <div class="video-title">${video.title || `Video ${video.id}`}</div>
            <div class="video-meta">
                <span class="video-type">${video.video_type || "Showcase"}</span>
                <span class="video-date">${formattedDate}</span>
            </div>
            <div class="video-actions">
                ${videoActionsHTML}
            </div>
        </div>
    `;

  // Add click event for video card (for video playback)
  card.addEventListener("click", (e) => {
    // Don't trigger if clicking on action buttons or checkbox
    if (
      e.target.closest(".video-actions") ||
      e.target.closest(".video-checkbox-container")
    ) {
      return;
    }

    if (isPlayable) {
      // Show video player modal
      showVideoPlayer(video);
    } else if (videoUrl) {
      // Open video in new tab for non-playable statuses
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: videoUrl });
      } else {
        // Fallback for testing in browser
        window.open(videoUrl, "_blank");
      }
    }
  });

  // Add event listeners for action buttons
  const uploadBtn = card.querySelector(".upload-btn");
  const captionBtn = card.querySelector(".caption-btn");
  const productIdBtn = card.querySelector(".product-id-btn");
  const aiContentBtn = card.querySelector(".ai-content-btn");
  const postTiktokBtn = card.querySelector(".post-tiktok-btn");
  const autoPostBtn = card.querySelector(".auto-post-btn");

  // Tooltip elements
  const uploadTooltip =
    uploadBtn?.parentElement?.querySelector(".tooltip-text");
  const captionTooltip =
    captionBtn?.parentElement?.querySelector(".tooltip-text");
  const productIdTooltip =
    productIdBtn?.parentElement?.querySelector(".tooltip-text");
  const aiContentTooltip =
    aiContentBtn?.parentElement?.querySelector(".tooltip-text");

  if (uploadBtn) {
    uploadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleUploadClick(video);
    });
  }

  if (captionBtn) {
    captionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleCaptionClick(caption, captionTooltip);
    });
  }

  if (productIdBtn) {
    productIdBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleProductIdClick(video.product_id, productIdTooltip, productIdBtn);
    });
  }

  if (aiContentBtn) {
    aiContentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleAIContentClick(aiContentBtn, aiContentTooltip);
    });
  }

  if (postTiktokBtn) {
    postTiktokBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlePostTiktokClick(postTiktokBtn);
    });
  }

  if (autoPostBtn) {
    autoPostBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleAutoPostClick(video, autoPostBtn);
    });
  }

  // Add event listeners for schedule buttons (Manual Schedule mode)
  const setScheduleBtn = card.querySelector(".set-schedule-btn");
  const scheduleHourSelect = card.querySelector(".schedule-hour-select");
  const scheduleMinuteSelect = card.querySelector(".schedule-minute-select");

  if (setScheduleBtn) {
    setScheduleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleSetScheduleClick(
        video,
        scheduleHourSelect,
        scheduleMinuteSelect,
        setScheduleBtn,
      );
    });
  }

  // Add event listener for Auto Schedule button
  const autoScheduleBtn = card.querySelector(".auto-schedule-btn");
  if (autoScheduleBtn) {
    autoScheduleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleAutoScheduleClick(
        video,
        autoScheduleBtn,
        scheduleHourSelect,
        scheduleMinuteSelect,
      );
    });
  }

  return card;
}

function renderProducts() {
  if (!products.length) {
    showEmptyState("products", "No products found");
    return;
  }

  hideLoading("products");
  productsEmptyEl.style.display = "none";
  productsBodyEl.innerHTML = "";

  products.forEach((product) => {
    const row = document.createElement("tr");

    row.innerHTML = `
            <td>${product.id}</td>
            <td>${product.title || "Untitled"}</td>
            <td>${product.price || "N/A"}</td>
            <td><span class="status-badge ${getProductStatusClass(product)}">${product.status || "Active"}</span></td>
        `;

    productsBodyEl.appendChild(row);
  });
}

function renderAccounts() {
  if (!accounts.length) {
    showEmptyState("accounts", "No TikTok accounts connected");
    return;
  }

  hideLoading("accounts");
  accountsEmptyEl.style.display = "none";
  accountsListEl.innerHTML = "";

  // Clear and populate account filter dropdown
  if (accountFilterEl) {
    // Keep the "All Accounts" option
    accountFilterEl.innerHTML = '<option value="all">All Accounts</option>';

    accounts.forEach((account) => {
      const option = document.createElement("option");
      // Use tiktok_id for filtering (without @ symbol)
      const tiktokId =
        account.tiktok_id || account.uniqueId || account.unique_id;
      option.value = tiktokId || account.id;

      // Truncate long account names for better display
      const maxNicknameLength = 15;
      let displayNickname = account.nickname || "Unknown";
      if (displayNickname.length > maxNicknameLength) {
        displayNickname =
          displayNickname.substring(0, maxNicknameLength) + "...";
      }

      option.textContent = `${displayNickname} (${tiktokId || "unknown"})`;
      accountFilterEl.appendChild(option);
    });
  }

  accounts.forEach((account) => {
    const accountCard = document.createElement("div");
    accountCard.className = "account-card";

    accountCard.innerHTML = `
            <div class="account-avatar">
                <img src="${account.avatar || "https://via.placeholder.com/40"}" alt="${account.nickname}">
            </div>
            <div class="account-info">
                <div class="account-name">${account.nickname}</div>
                <div class="account-handle">@${account.uniqueId || account.unique_id || "unknown"}</div>
            </div>
            <div class="account-status">Active</div>
        `;

    accountsListEl.appendChild(accountCard);
  });
}

// Helper Functions
function showLoading(section) {
  const loadingEl = document.getElementById(`${section}Loading`);
  const contentEl =
    document.getElementById(`${section}Grid`) ||
    document.getElementById(`${section}Table`) ||
    document.getElementById(`${section}List`);
  const emptyEl = document.getElementById(`${section}Empty`);

  if (loadingEl) loadingEl.style.display = "flex";
  if (contentEl) contentEl.style.display = "none";
  if (emptyEl) emptyEl.style.display = "none";
}

function hideLoading(section) {
  const loadingEl = document.getElementById(`${section}Loading`);
  const contentEl =
    document.getElementById(`${section}Grid`) ||
    document.getElementById(`${section}Table`) ||
    document.getElementById(`${section}List`);

  if (loadingEl) loadingEl.style.display = "none";
  if (contentEl) contentEl.style.display = "grid" || "table" || "block";

  // Show bulk controls if we are in auto-post mode and have videos
  if (section === "videos") {
    updateBulkControlsVisibility();
    updateCheckboxVisibility();
  }
}

function updateBulkControlsVisibility() {
  const bulkControls = document.getElementById("bulkControls");
  if (bulkControls) {
    const isBulkMode =
      currentPostMode === "auto-post" || currentPostMode === "auto-schedule";
    const hasVideos = videos.length > 0;
    bulkControls.style.display = isBulkMode && hasVideos ? "flex" : "none";

    // Check if bulk processing is active
    chrome.storage.local.get(["isBulkProcessing"], (result) => {
      const isBulkProcessing = result.isBulkProcessing || false;
      const startBtn = document.getElementById("startBulkPost");
      const stopBtn = document.getElementById("stopBulkPost");
      if (startBtn) startBtn.style.display = isBulkProcessing ? "none" : "flex";
      if (stopBtn) stopBtn.style.display = isBulkProcessing ? "flex" : "none";
    });
  }
}

function showEmptyState(section, message = "No data found") {
  const loadingEl = document.getElementById(`${section}Loading`);
  const contentEl =
    document.getElementById(`${section}Grid`) ||
    document.getElementById(`${section}Table`) ||
    document.getElementById(`${section}List`);
  const emptyEl = document.getElementById(`${section}Empty`);

  if (loadingEl) loadingEl.style.display = "none";
  if (contentEl) contentEl.style.display = "none";
  if (emptyEl) {
    emptyEl.querySelector("p").textContent = message;
    emptyEl.style.display = "flex";
  }
}

function getStatusClass(status) {
  if (!status) return "other";

  const statusLower = status.toLowerCase();
  if (statusLower.includes("completed") || statusLower.includes("ready"))
    return "completed";
  if (statusLower.includes("posted")) return "posted";
  if (statusLower.includes("scheduled")) return "ready";
  return "other";
}

function getStatusText(status) {
  if (!status) return "Unknown";

  // Shorten status text for badge
  if (status.length > 15) {
    return status.split(" ")[0];
  }
  return status;
}

function getVideoThumbnail(video) {
  // Priority: image_url -> showcase_url -> selected_image -> placeholder
  if (video.image_url && video.image_url !== "none") {
    return video.image_url.includes("http")
      ? video.image_url
      : `${API_BASE_URL}${video.image_url}`;
  }
  if (video.showcase_url && video.showcase_url !== "none") {
    return video.showcase_url.includes("http")
      ? video.showcase_url
      : `${API_BASE_URL}${video.showcase_url}`;
  }
  if (video.selected_image && video.selected_image !== "none") {
    return video.selected_image.includes("http")
      ? video.selected_image
      : `${API_BASE_URL}${video.selected_image}`;
  }
  return "https://via.placeholder.com/160x100/1e293b/94a3b8?text=No+Thumbnail";
}

function getProductStatusClass(product) {
  // You can customize this based on your product status logic
  return "completed"; // Default to active
}

function extractProductsFromVideos() {
  const productMap = new Map();

  videos.forEach((video) => {
    if (
      video.product_id &&
      video.product_id !== "manual" &&
      video.product_id !== "none"
    ) {
      if (!productMap.has(video.product_id)) {
        productMap.set(video.product_id, {
          id: video.product_id,
          title: video.title || `Product ${video.product_id}`,
          price: video.price || "N/A",
          status: "Active",
          videoCount: 1,
        });
      } else {
        const product = productMap.get(video.product_id);
        product.videoCount++;
      }
    }
  });

  return Array.from(productMap.values());
}

function formatDate(dateString) {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch (error) {
    return "Invalid date";
  }
}

// Get user ID from web app by communicating with it
async function getUserIdFromWebApp() {
  return new Promise((resolve, reject) => {
    // Check if Chrome APIs are available
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
      reject(new Error("Chrome APIs not available"));
      return;
    }

    // Try to get the web app tab
    chrome.tabs.query({ url: `${API_BASE_URL}/*` }, (tabs) => {
      if (tabs.length === 0) {
        // Try to open the web app in a new tab
        chrome.tabs.create(
          { url: `${API_BASE_URL}/dashboard`, active: false },
          (newTab) => {
            // Wait for the tab to load
            setTimeout(() => {
              chrome.tabs.sendMessage(
                newTab.id,
                { action: "GET_USER_ID" },
                (response) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (response?.success && response.userId) {
                    resolve(response.userId);
                  } else {
                    reject(new Error("No user ID received"));
                  }
                },
              );
            }, 2000); // Wait 2 seconds for page to load
          },
        );
        return;
      }

      // Send message to the web app to get user ID
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "GET_USER_ID" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success && response.userId) {
            resolve(response.userId);
          } else {
            reject(new Error("No user ID received"));
          }
        },
      );
    });
  });
}

// Storage helpers
async function saveToStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

async function getFromStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

async function clearUserStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.USER], () => {
      currentUser = null;
      videos = [];
      products = [];
      accounts = [];
      resolve();
    });
  });
}

// Logout function
async function logout() {
  // Show loading state in user info
  userInfoEl.innerHTML = '<div class="loading">Logging out...</div>';

  // Clear user storage
  await clearUserStorage();

  // Clear UI
  userInfoEl.innerHTML = '<div class="loading">Loading user...</div>';
  creditsInfoEl.innerHTML =
    '<i class="fas fa-coins"></i><span>0 credits</span>';

  // Hide logout button
  document.getElementById("logoutBtn").style.display = "none";

  // Show login container
  showLoginContainer();

  // Clear videos grid
  videosGridEl.innerHTML = "";
  videosEmptyEl.style.display = "flex";
  videosEmptyEl.querySelector("p").textContent = "Please log in to view videos";

  // Clear products table
  productsBodyEl.innerHTML = "";
  productsEmptyEl.style.display = "flex";
  productsEmptyEl.querySelector("p").textContent =
    "Please log in to view products";

  // Clear accounts list
  accountsListEl.innerHTML = "";
  accountsEmptyEl.style.display = "flex";
  accountsEmptyEl.querySelector("p").textContent =
    "Please log in to view accounts";

  // Clear account filter
  if (accountFilterEl) {
    accountFilterEl.innerHTML = '<option value="all">All Accounts</option>';
  }

  // Reset video type filter to default
  videoTypeFilter = "all";

  // Update video type tabs UI
  document.querySelectorAll(".video-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.videoType === "all");
  });

  console.log("User logged out successfully");

  // After logout, try to check auth again to see if user is still logged in web app
  // This allows users to switch accounts without closing the web app
  setTimeout(async () => {
    await checkAuth();
  }, 1000);
}

// API helpers
async function fetchWithAuth(url, options = {}) {
  try {
    // Use chrome.runtime.sendMessage to communicate with background script
    // which can make the actual API call without CORS restrictions
    return new Promise((resolve, reject) => {
      // Build headers safely
      const headers = {
        "Content-Type": "application/json",
        ...options.headers,
      };

      // Only add x-user-id if currentUser exists and has an id
      if (currentUser && currentUser.id) {
        headers["x-user-id"] = currentUser.id.toString();
      }

      chrome.runtime.sendMessage(
        {
          action: "FETCH_API",
          url: url,
          options: {
            ...options,
            headers: headers,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else if (response) {
            // Create a mock Response object
            const mockResponse = {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers || {}),
              json: () => Promise.resolve(response.data),
              text: () => Promise.resolve(JSON.stringify(response.data)),
            };
            resolve(mockResponse);
          } else {
            reject(new Error("No response from background script"));
          }
        },
      );
    });
  } catch (error) {
    console.error("Error in fetchWithAuth:", error);
    throw error;
  }
}

// Webhook tracking
async function sendWebhookEvent(eventType, videoId, buttonType) {
  try {
    if (!currentUser || !currentUser.id) {
      console.warn("Cannot send webhook: No user logged in");
      return;
    }

    const webhookData = {
      event_type: eventType,
      user_id: currentUser.id,
      video_id: videoId,
      button_type: buttonType,
      timestamp: new Date().toISOString(),
      credits_used:
        buttonType === "auto_post" || buttonType === "auto_schedule" ? 5 : 0, // Auto Post and Auto Schedule use 5 credits, Post Now uses 0
    };

    console.log(`Sending webhook for ${buttonType}:`, webhookData);

    // Send webhook via background script
    chrome.runtime.sendMessage(
      {
        action: "SEND_WEBHOOK",
        data: webhookData,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending webhook:", chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log("Webhook sent successfully");
        } else {
          console.warn("Webhook failed:", response?.error);
        }
      },
    );
  } catch (error) {
    console.error("Error in sendWebhookEvent:", error);
  }
}

async function handleStartBulkPost() {
  const selectedCheckboxes = document.querySelectorAll(
    ".video-bulk-checkbox:checked",
  );
  if (selectedCheckboxes.length === 0) {
    alert("Please select at least one video to post.");
    return;
  }

  const selectedVideoIds = Array.from(selectedCheckboxes).map(
    (cb) => cb.dataset.videoId,
  );
  const selectedVideos = videos
    .filter((v) => selectedVideoIds.includes(v.id.toString()))
    .map((v) => {
      const videoCard = document
        .querySelector(`.video-bulk-checkbox[data-video-id="${v.id}"]`)
        .closest(".video-card");
      const hour = videoCard.querySelector(".schedule-hour-select")?.value;
      const minute = videoCard.querySelector(".schedule-minute-select")?.value;

      return {
        id: v.id,
        video_url: v.complete_video || v.video_url,
        caption: v.tone || `${v.title} - ${v.price}`,
        product_id: v.product_id,
        schedule_hour: hour,
        schedule_minute: minute,
        is_schedule: currentPostMode === "auto-schedule",
      };
    });

  await chrome.storage.local.set({
    isBulkProcessing: true,
    bulkQueue: selectedVideos,
    currentBulkIndex: 0,
    bulkMode: currentPostMode,
  });

  // Update UI
  updateBulkControlsVisibility();

  // Open TikTok upload page immediately for the first video
  const firstVideo = selectedVideos[0];

  // Use the existing handleAutoPostClick logic to ensure all steps are followed
  // We need to find the video object from the 'videos' array to pass to handleAutoPostClick
  const videoObj = videos.find(
    (v) => v.id.toString() === firstVideo.id.toString(),
  );
  if (videoObj) {
    // We need a button element for handleAutoPostClick, but since we are starting bulk,
    // we can just trigger the background message directly or mock the button.
    // To follow "all steps of auto post method", let's use the background message
    // but ensure it's consistent with what handleAutoPostClick does.

    chrome.runtime.sendMessage({
      action: "OPEN_UPLOAD_PAGE",
      data: {
        id: videoObj.id,
        video_url: videoObj.complete_video || videoObj.video_url,
        caption: videoObj.tone || `${videoObj.title} - ${videoObj.price}`,
        product_id: videoObj.product_id,
      },
    });
  }
}

async function handleStopBulkPost() {
  await chrome.storage.local.set({
    isBulkProcessing: false,
    bulkQueue: [],
    currentBulkIndex: 0,
  });
  updateBulkControlsVisibility();
  alert("Bulk posting stopped.");
}

// Background communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "EXTENSION_ID_REQUEST") {
    sendResponse({
      success: true,
      extensionId: chrome.runtime.id,
      source: "tiktok_automator_extension",
    });
  }

  if (message.action === "PING") {
    sendResponse({ success: true, message: "Extension is alive" });
  }

  if (message.action === "USER_LOGGED_IN") {
    // Refresh user data when logged in from another tab
    checkAuth().then(() => {
      if (currentUser) {
        loadAllData();
      }
    });
  }
});

// Upload and Caption Functions
async function checkUploadPageStatus() {
  try {
    // Check for both TikTok upload URLs with or without query parameters
    // We need to query all tabs and filter manually because chrome.tabs.query
    // doesn't support wildcards for query parameters
    const allTabs = await chrome.tabs.query({});

    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;

      const url = tab.url.toLowerCase();
      // Check for regular upload page with or without query parameters
      const isRegularUpload = url.includes("tiktok.com/upload");
      // Check for studio upload page with or without query parameters
      const isStudioUpload = url.includes("tiktok.com/tiktokstudio/upload");

      return isRegularUpload || isStudioUpload;
    });

    return uploadTabs.length > 0;
  } catch (error) {
    console.error("Error checking upload page status:", error);
    return false;
  }
}

async function updateUploadButtonsStatus() {
  const isOnUploadPage = await checkUploadPageStatus();
  const actionButtons = document.querySelectorAll(
    ".caption-btn, .product-id-btn, .ai-content-btn, .post-tiktok-btn, .auto-post-btn, .auto-schedule-btn, .set-schedule-btn, .schedule-hour-select, .schedule-minute-select",
  );

  actionButtons.forEach((btn) => {
    if (isOnUploadPage) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.filter = "none";
      if (btn.classList.contains("caption-btn")) btn.title = "Fill Caption";
      if (btn.classList.contains("product-id-btn")) btn.title = "Add Product";
      if (btn.classList.contains("ai-content-btn")) btn.title = "AI Content";
      if (btn.classList.contains("post-tiktok-btn")) btn.title = "Post Now";
      if (btn.classList.contains("auto-post-btn")) btn.title = "Auto Post";
      if (btn.classList.contains("auto-schedule-btn"))
        btn.title = "Auto Schedule";
      if (btn.classList.contains("set-schedule-btn"))
        btn.title = "Set Schedule";
      if (
        btn.classList.contains("schedule-hour-select") ||
        btn.classList.contains("schedule-minute-select")
      ) {
        btn.title = "Select schedule time";
      }
    } else {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.style.filter = "grayscale(100%)";
      btn.title = "Please open TikTok upload page first";
    }
  });

  // Handle upload buttons separately - they should always be enabled
  const uploadButtons = document.querySelectorAll(".upload-btn");
  uploadButtons.forEach((btn) => {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
    btn.style.filter = "none";
    if (isOnUploadPage) {
      btn.title = "Upload to TikTok";
    } else {
      btn.title = "Open TikTok upload page and upload video";
    }
  });
}

async function handleUploadClick(video) {
  console.log("Upload button clicked for video:", video.id);

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Post")) {
    return;
  }

  // Check if user is on TikTok upload page
  const isOnUploadPage = await checkUploadPageStatus();

  if (!isOnUploadPage) {
    // Open TikTok upload page for the user
    console.log("Opening TikTok upload page...");

    try {
      await chrome.tabs.create({
        url: "https://www.tiktok.com/upload",
        active: true,
      });

      // Wait a moment for the page to start loading
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now try to upload the video
      console.log("TikTok upload page opened, attempting upload...");
    } catch (error) {
      console.error("Failed to open TikTok upload page:", error);
      alert("Failed to open TikTok upload page. Please try again.");
      return;
    }
  }

  try {
    // Get the first TikTok upload tab (check both URLs with or without query parameters)
    const allTabs = await chrome.tabs.query({});

    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;

      const url = tab.url.toLowerCase();
      // Check for regular upload page with or without query parameters
      const isRegularUpload = url.includes("tiktok.com/upload");
      // Check for studio upload page with or without query parameters
      const isStudioUpload = url.includes("tiktok.com/tiktokstudio/upload");

      return isRegularUpload || isStudioUpload;
    });

    if (uploadTabs.length === 0) {
      console.log("No TikTok upload page found.");
      return;
    }

    const uploadTab = uploadTabs[0];

    // Send message to content script to upload video and auto-fill caption
    chrome.tabs.sendMessage(
      uploadTab.id,
      {
        action: "UPLOAD_VIDEO",
        data: {
          taskId: video.id,
          videoUrl: video.complete_video || video.video_url,
          caption: video.tone || `${video.title} - ${video.price}`,
          // No product - user will add manually if needed
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
        } else if (response && !response.success) {
          console.error("Upload failed:", response.error);
        } else {
          console.log("Video upload started successfully.");
        }
      },
    );
  } catch (error) {
    console.error("Error in handleUploadClick:", error);
  }
}

async function handleCaptionClick(caption, tooltip) {
  console.log("Caption button clicked:", caption);

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Post")) {
    return;
  }

  // 1. Copy caption to clipboard (keep existing functionality)
  try {
    await navigator.clipboard.writeText(caption);

    // Show success message in tooltip
    if (tooltip) {
      const originalText = tooltip.textContent;
      tooltip.textContent = "Filled!";
      tooltip.style.color = "#22c55e";
      setTimeout(() => {
        tooltip.textContent = originalText;
        tooltip.style.color = "";
      }, 2000);
    }
  } catch (error) {
    console.error("Failed to copy caption:", error);
  }

  // 2. Auto-fill caption if on TikTok upload page
  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    return;
  }

  if (isOnUploadPage) {
    try {
      const allTabs = await chrome.tabs.query({});
      const uploadTabs = allTabs.filter((tab) => {
        if (!tab.url) return false;
        const url = tab.url.toLowerCase();
        return (
          url.includes("tiktok.com/upload") ||
          url.includes("tiktok.com/tiktokstudio/upload")
        );
      });

      if (uploadTabs.length > 0) {
        chrome.tabs.sendMessage(uploadTabs[0].id, {
          action: "SET_CAPTION",
          data: { caption: caption },
        });
      }
    } catch (error) {
      console.error("Error auto-filling caption:", error);
    }
  }
}

async function handleProductIdClick(productId, tooltip, button) {
  console.log("Product ID button clicked:", productId);

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Post")) {
    return;
  }

  // 1. Copy product ID to clipboard (keep existing functionality)
  try {
    await navigator.clipboard.writeText(productId);

    // Show success message in tooltip
    if (tooltip) {
      const originalText = tooltip.textContent;
      tooltip.textContent = "Adding...";
      tooltip.style.color = "#eab308";
      setTimeout(() => {
        tooltip.textContent = originalText;
        tooltip.style.color = "";
      }, 3000);
    }
  } catch (error) {
    console.error("Failed to copy product ID:", error);
  }

  // 2. Auto-add product if on TikTok upload page
  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    return;
  }

  if (isOnUploadPage) {
    try {
      const allTabs = await chrome.tabs.query({});
      const uploadTabs = allTabs.filter((tab) => {
        if (!tab.url) return false;
        const url = tab.url.toLowerCase();
        return (
          url.includes("tiktok.com/upload") ||
          url.includes("tiktok.com/tiktokstudio/upload")
        );
      });

      if (uploadTabs.length > 0) {
        chrome.tabs.sendMessage(
          uploadTabs[0].id,
          {
            action: "ADD_PRODUCT",
            data: { productId: productId },
          },
          (response) => {
            if (response && response.success) {
              // Don't change button text, just show success in tooltip
              if (tooltip) {
                tooltip.textContent = "Added!";
                tooltip.style.color = "#22c55e";
                setTimeout(() => {
                  tooltip.textContent = "Product ID";
                  tooltip.style.color = "";
                }, 2000);
              }
            } else if (response && response.error) {
              console.error("Failed to add product:", response.error);
              if (tooltip) {
                tooltip.textContent = "Failed";
                tooltip.style.color = "#ef4444";
                setTimeout(() => {
                  tooltip.textContent = "Product ID";
                  tooltip.style.color = "";
                }, 2000);
              }
            }
          },
        );
      }
    } catch (error) {
      console.error("Error auto-adding product:", error);
    }
  }
}

async function handleAIContentClick(btn, tooltip) {
  console.log("AI Content button clicked");

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Post")) {
    return;
  }

  if (tooltip) {
    tooltip.textContent = "Enabling...";
    tooltip.style.color = "#3b82f6";
  }

  try {
    const isOnUploadPage = await checkUploadPageStatus();
    if (!isOnUploadPage) {
      alert("Please open TikTok upload page first");
      if (tooltip) {
        tooltip.textContent = "AI Content";
        tooltip.style.color = "";
      }
      return;
    }

    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length > 0) {
      chrome.tabs.sendMessage(
        uploadTabs[0].id,
        { action: "TOGGLE_AI_CONTENT" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log("Message error:", chrome.runtime.lastError);
            if (tooltip) {
              tooltip.textContent = "AI Content";
              tooltip.style.color = "";
            }
            return;
          }
          if (response && response.success) {
            if (tooltip) {
              tooltip.textContent = "Enabled!";
              tooltip.style.color = "#22c55e";
              setTimeout(() => {
                tooltip.textContent = "AI Content";
                tooltip.style.color = "";
              }, 2000);
            }
          } else {
            if (tooltip) {
              tooltip.textContent = "Failed";
              tooltip.style.color = "#ef4444";
              setTimeout(() => {
                tooltip.textContent = "AI Content";
                tooltip.style.color = "";
              }, 2000);
            }
          }
        },
      );
    } else {
      if (tooltip) {
        tooltip.textContent = "AI Content";
        tooltip.style.color = "";
      }
    }
  } catch (error) {
    console.error("Error enabling AI content:", error);
    if (tooltip) {
      tooltip.textContent = "AI Content";
      tooltip.style.color = "";
    }
  }
}

async function handlePostTiktokClick(btn) {
  console.log("Post Now button clicked");

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Post")) {
    return;
  }

  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    btn.innerHTML = originalHTML;
    console.log("Not on upload page");
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

  try {
    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length > 0) {
      // Get the video ID from the button's data attribute
      const videoId = btn.dataset.videoId;

      chrome.tabs.sendMessage(
        uploadTabs[0].id,
        {
          action: "CLICK_POST",
          data: { taskId: videoId },
        },
        (response) => {
          if (response && response.success) {
            // Send webhook after post is successful
            sendWebhookEvent("post_success", videoId, "post_now");

            btn.innerHTML = '<i class="fas fa-check"></i> Posted!';
            btn.style.background = "rgba(34, 197, 94, 0.2)";
            btn.style.color = "#22c55e";
            setTimeout(() => {
              btn.innerHTML = originalHTML;
              btn.style.background = "";
              btn.style.color = "";
            }, 2000);
          } else {
            btn.innerHTML = '<i class="fas fa-times"></i> Failed';
            btn.style.color = "#ef4444";
            setTimeout(() => {
              btn.innerHTML = originalHTML;
              btn.style.color = "";
            }, 2000);
          }
        },
      );
    }
  } catch (error) {
    console.error("Error clicking post button:", error);
    btn.innerHTML = originalHTML;
  }
}

async function handleAutoPostClick(video, btn) {
  console.log("Auto Post button clicked for video:", video.id);

  // Check if user has premium plan for auto-post feature
  if (!checkPremiumFeatureAccess("Auto Post")) {
    console.log("Auto Post feature requires premium plan");
    return;
  }

  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    console.log("User not on TikTok upload page. Auto Post aborted.");
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto Posting...';
  btn.disabled = true;

  try {
    // Get the first TikTok upload tab
    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length === 0) {
      console.log("No TikTok upload page found.");
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      return;
    }

    const uploadTab = uploadTabs[0];
    const caption = video.tone || `${video.title} - ${video.price}`;
    const hasProductId =
      video.product_id &&
      video.product_id.trim() !== "" &&
      video.product_id !== "manual" &&
      video.product_id !== "none";

    // Helper function to send message with retry logic
    async function sendMessageWithRetry(action, data, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Attempt ${attempt} to send ${action} message...`);

          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
              uploadTab.id,
              { action, data },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              },
            );
          });

          console.log(
            `${action} message sent successfully on attempt ${attempt}`,
          );
          return response;
        } catch (error) {
          console.warn(
            `Attempt ${attempt} failed for ${action}:`,
            error.message,
          );

          if (attempt < maxRetries) {
            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));

            // Try to inject content script if it's not loaded
            if (error.message.includes("Receiving end does not exist")) {
              console.log("Attempting to inject content script...");
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: uploadTab.id },
                  files: ["content.js"],
                });
                console.log("Content script injected successfully");
                await new Promise((resolve) => setTimeout(resolve, 1000));
              } catch (injectError) {
                console.warn(
                  "Failed to inject content script:",
                  injectError.message,
                );
              }
            }
          } else {
            throw error;
          }
        }
      }
    }

    // Step 1: Upload video
    console.log("Step 1: Uploading video...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    const uploadResult = await sendMessageWithRetry("UPLOAD_VIDEO", {
      taskId: video.id,
      videoUrl: video.complete_video || video.video_url,
      caption: caption,
    });

    if (!uploadResult || !uploadResult.success) {
      console.error("Upload failed:", uploadResult?.error);
      btn.innerHTML = '<i class="fas fa-times"></i> Upload Failed';
      btn.style.color = "#ef4444";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
        btn.disabled = false;
      }, 2000);
      return;
    }

    // Wait for video processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 2: Set caption
    console.log("Step 2: Setting caption...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting caption...';

    const captionResult = await sendMessageWithRetry("SET_CAPTION", {
      caption: caption,
    });

    if (!captionResult || !captionResult.success) {
      console.warn("Caption setting failed:", captionResult?.error);
      // Continue anyway - caption might already be set from upload
    }

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 3: Add product ID if available
    if (hasProductId) {
      console.log("Step 3: Adding product ID...");
      btn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Adding product...';

      const productResult = await sendMessageWithRetry("ADD_PRODUCT", {
        productId: video.product_id,
      });

      if (!productResult || !productResult.success) {
        console.warn("Product addition failed:", productResult?.error);
        // Continue anyway - product might not be required
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Step 4: Enable AI content
    console.log("Step 4: Enabling AI content...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enabling AI...';

    const aiResult = await sendMessageWithRetry("TOGGLE_AI_CONTENT", {});

    if (!aiResult || !aiResult.success) {
      console.warn("AI content enabling failed:", aiResult?.error);
      // Continue anyway - AI might already be enabled or not available
    }

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 5: Click Post button
    console.log("Step 5: Clicking Post button...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

    const postResult = await sendMessageWithRetry("CLICK_POST", {
      taskId: video.id,
    });

    if (postResult && postResult.success) {
      console.log("Auto Post completed successfully!");

      // Send webhook after post is successful
      sendWebhookEvent("post_success", video.id, "auto_post");

      btn.innerHTML = '<i class="fas fa-check"></i> Auto Posted!';
      btn.style.background = "rgba(34, 197, 94, 0.2)";
      btn.style.color = "#22c55e";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = "";
        btn.style.color = "";
        btn.disabled = false;
      }, 3000);
    } else {
      console.error("Post failed:", postResult?.error);
      btn.innerHTML = '<i class="fas fa-times"></i> Post Failed';
      btn.style.color = "#ef4444";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error("Error in handleAutoPostClick:", error);
    btn.innerHTML = '<i class="fas fa-times"></i> Error';
    btn.style.color = "#ef4444";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
      btn.disabled = false;
    }, 2000);
  }
}

// Video Player Functions
function showVideoPlayer(video) {
  const modal = document.getElementById("videoPlayerModal");
  const videoElement = document.getElementById("videoPlayer");
  const titleElement = document.getElementById("videoPlayerTitle");
  const typeElement = document.getElementById("videoPlayerType");
  const statusElement = document.getElementById("videoPlayerStatus");

  const videoUrl = video.complete_video || video.video_url;

  if (!videoUrl) {
    console.error("No video URL available");
    return;
  }

  // Set video source
  videoElement.src = videoUrl;

  // Set video info
  titleElement.textContent = video.title || `Video ${video.id}`;
  typeElement.textContent = video.video_type || "Showcase";
  statusElement.textContent = video.status || "Unknown";

  // Set status class
  statusElement.className = "video-player-status";
  if (video.status === "Ready to Post") {
    statusElement.classList.add("ready");
  } else if (video.status === "Posted to Tiktok") {
    statusElement.classList.add("posted");
  }

  // Show modal
  modal.style.display = "flex";

  // Play video automatically
  videoElement.play().catch((error) => {
    console.warn("Auto-play failed:", error);
    // User interaction might be required for autoplay
  });
}

function hideVideoPlayer() {
  const modal = document.getElementById("videoPlayerModal");
  const videoElement = document.getElementById("videoPlayer");

  // Pause video
  videoElement.pause();
  videoElement.currentTime = 0;

  // Hide modal
  modal.style.display = "none";
}

// Upload Status Window Functions
function showUploadStatusWindow() {
  if (uploadStatusWindowEl) {
    uploadStatusWindowEl.style.display = "block";
  }
}

function hideUploadStatusWindow() {
  if (uploadStatusWindowEl) {
    uploadStatusWindowEl.style.display = "none";
  }
}

function updateUploadStatusWindow() {
  if (!uploadStatusWindowEl || !uploadStatusBadgeEl || !uploadStatusUrlEl) {
    return;
  }

  checkUploadPageStatus()
    .then((isOnUploadPage) => {
      if (isOnUploadPage) {
        // Get the actual upload tab URL
        chrome.tabs.query({}, (allTabs) => {
          const uploadTabs = allTabs.filter((tab) => {
            if (!tab.url) return false;
            const url = tab.url.toLowerCase();
            const isRegularUpload = url.includes("tiktok.com/upload");
            const isStudioUpload = url.includes(
              "tiktok.com/tiktokstudio/upload",
            );
            return isRegularUpload || isStudioUpload;
          });

          if (uploadTabs.length > 0) {
            const uploadTab = uploadTabs[0];
            const url = new URL(uploadTab.url);
            const displayUrl = `${url.hostname}${url.pathname}`;

            uploadStatusBadgeEl.textContent = "Ready";
            uploadStatusBadgeEl.className = "status-badge ready";
            uploadStatusUrlEl.textContent = displayUrl;
            showUploadStatusWindow();
          } else {
            uploadStatusBadgeEl.textContent = "Waiting";
            uploadStatusBadgeEl.className = "status-badge waiting";
            uploadStatusUrlEl.textContent = "No TikTok upload page found";
            hideUploadStatusWindow();
          }
        });
      } else {
        uploadStatusBadgeEl.textContent = "Waiting";
        uploadStatusBadgeEl.className = "status-badge waiting";
        uploadStatusUrlEl.textContent =
          "Open TikTok upload page to enable uploads";
        hideUploadStatusWindow();
      }
    })
    .catch((error) => {
      console.error("Error updating upload status window:", error);
      if (uploadStatusBadgeEl && uploadStatusUrlEl) {
        uploadStatusBadgeEl.textContent = "Error";
        uploadStatusBadgeEl.className = "status-badge error";
        uploadStatusUrlEl.textContent = "Error checking upload page status";
      }
    });
}

// Upload page status checker
function startUploadPageStatusChecker() {
  // Initial check
  updateUploadButtonsStatus();
  updateUploadStatusWindow();

  // Check every 5 seconds
  setInterval(() => {
    updateUploadButtonsStatus();
    updateUploadStatusWindow();
  }, 5000);
}

// Credits sync
function startCreditsSync() {
  let syncAttempts = 0;
  const MAX_SYNC_ATTEMPTS = 3;
  const SYNC_INTERVAL = 15000; // 15 seconds instead of 10 to reduce server load

  // Initial sync after 2 seconds
  setTimeout(() => syncCredits(), 2000);

  // Periodic sync
  const syncInterval = setInterval(() => {
    syncCredits();
  }, SYNC_INTERVAL);

  async function syncCredits() {
    // Double-check currentUser is not null before proceeding
    if (!currentUser) {
      console.debug("Credits sync skipped: No current user");
      return;
    }

    // Don't sync if we've had too many failures
    if (syncAttempts >= MAX_SYNC_ATTEMPTS) {
      console.warn("Credits sync disabled: Too many failed attempts");
      clearInterval(syncInterval);
      return;
    }

    try {
      console.debug("Starting credits sync...");
      const response = await fetchWithAuth(`${API_BASE_URL}/api/auth/me`);

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          // Reset sync attempts on success
          syncAttempts = 0;

          // Check if credits have changed
          const newCredits = data.user.credits || 0;
          const currentCredits = currentUser?.credits || 0; // Safe access with optional chaining

          if (newCredits !== currentCredits) {
            console.log(`Credits updated: ${currentCredits} -> ${newCredits}`);

            // Ensure currentUser exists before updating
            if (currentUser) {
              currentUser.credits = newCredits;

              // Also update other user fields that might have changed
              currentUser.email = data.user.email || currentUser.email;
              currentUser.name = data.user.name || currentUser.name;

              await saveToStorage(STORAGE_KEYS.USER, currentUser);
              updateUserUI();

              // Show a subtle notification in the footer
              showCreditUpdateNotification(newCredits);
            }
          } else {
            console.debug("Credits unchanged:", newCredits);
          }
        } else {
          console.warn("Credits sync: No user data in response");
          syncAttempts++;
        }
      } else {
        console.warn(`Credits sync failed with status: ${response.status}`);
        syncAttempts++;

        // If unauthorized, try to re-authenticate
        if (response.status === 401 || response.status === 403) {
          console.log(
            "Authentication expired, attempting to re-authenticate...",
          );
          await checkAuth();
        }
      }
    } catch (error) {
      console.error("Credits sync error:", error.message);
      syncAttempts++;

      // Don't show error for network issues, only log
      if (
        error.message.includes("Network") ||
        error.message.includes("Failed to fetch")
      ) {
        console.debug("Network error during credits sync, will retry");
      }
    }
  }

  // Also sync when user explicitly refreshes videos
  document.getElementById("refreshVideos")?.addEventListener("click", () => {
    setTimeout(() => syncCredits(), 1000);
  });

  // Sync when checking login status
  document.getElementById("checkLogin")?.addEventListener("click", () => {
    setTimeout(() => syncCredits(), 1000);
  });
}

function showCreditUpdateNotification(newCredits) {
  const creditsInfoEl = document.getElementById("creditsInfo");
  if (!creditsInfoEl) return;

  // Create a temporary notification effect
  const originalHTML = creditsInfoEl.innerHTML;
  creditsInfoEl.style.transition = "all 0.3s ease";
  creditsInfoEl.style.backgroundColor = "rgba(34, 197, 94, 0.1)";
  creditsInfoEl.style.borderRadius = "4px";
  creditsInfoEl.style.padding = "2px 6px";

  // Restore after 1.5 seconds
  setTimeout(() => {
    creditsInfoEl.style.backgroundColor = "";
    creditsInfoEl.style.transition = "";
  }, 1500);
}

// Post Mode Toggle Functions
function setupPostModeToggleListeners() {
  const manualPostToggle = document.getElementById("manualPostToggle");
  const manualScheduleToggle = document.getElementById("manualScheduleToggle");
  const autoPostToggle = document.getElementById("autoPostToggle");
  const autoScheduleToggle = document.getElementById("autoScheduleToggle");
  const postModeDescription = document.getElementById("postModeDescription");

  if (
    !manualPostToggle ||
    !manualScheduleToggle ||
    !autoPostToggle ||
    !autoScheduleToggle ||
    !postModeDescription
  ) {
    console.warn("Post mode toggle elements not found");
    return;
  }

  // Set initial state
  updatePostModeUI(currentPostMode);

  // Add click event listeners
  manualPostToggle.addEventListener("click", () => {
    setPostMode("manual-post");
  });

  manualScheduleToggle.addEventListener("click", () => {
    setPostMode("manual-schedule");
  });

  autoPostToggle.addEventListener("click", () => {
    setPostMode("auto-post");
  });

  autoScheduleToggle.addEventListener("click", () => {
    setPostMode("auto-schedule");
  });
}

function setPostMode(mode) {
  if (mode === currentPostMode) return;

  currentPostMode = mode;
  updatePostModeUI(mode);
  console.log(`Post mode changed to: ${mode}`);

  // Re-render videos to update action buttons based on new mode
  if (videos.length > 0) {
    renderVideos();
  }

  // Update bulk controls and checkbox visibility
  updateBulkControlsVisibility();
  updateCheckboxVisibility();
}

function updatePostModeUI(mode) {
  const manualPostToggle = document.getElementById("manualPostToggle");
  const manualScheduleToggle = document.getElementById("manualScheduleToggle");
  const autoPostToggle = document.getElementById("autoPostToggle");
  const autoScheduleToggle = document.getElementById("autoScheduleToggle");
  const postModeDescription = document.getElementById("postModeDescription");

  if (
    !manualPostToggle ||
    !manualScheduleToggle ||
    !autoPostToggle ||
    !autoScheduleToggle ||
    !postModeDescription
  ) {
    return;
  }

  // Update toggle button states
  manualPostToggle.classList.toggle("active", mode === "manual-post");
  manualScheduleToggle.classList.toggle("active", mode === "manual-schedule");
  autoPostToggle.classList.toggle("active", mode === "auto-post");
  autoScheduleToggle.classList.toggle("active", mode === "auto-schedule");

  // Update description based on mode
  let description = "";
  switch (mode) {
    case "manual-post":
      description = "Manually post videos immediately with one click";
      break;
    case "manual-schedule":
      description = "Manually schedule videos for posting at specific times";
      break;
    case "auto-post":
      description = "Automatically upload, fill caption, add product, and post";
      break;
    case "auto-schedule":
      description = "Automatically schedule videos for optimal posting times";
      break;
    default:
      description = "Select a post mode to continue";
  }

  postModeDescription.textContent = description;
}

// Schedule Functions
async function handleSetScheduleClick(video, hourSelect, minuteSelect, btn) {
  console.log("Set Schedule button clicked for video:", video.id);

  // Check if user has premium plan
  if (!checkPremiumFeatureAccess("Manual Schedule")) {
    return;
  }

  const hour = hourSelect ? hourSelect.value : "";
  const minute = minuteSelect ? minuteSelect.value : "";

  if (!hour || !minute) {
    alert("Please select both hour and minute for scheduling");
    return;
  }

  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    console.log("User not on TikTok upload page. Schedule aborted.");
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting...';
  btn.disabled = true;

  try {
    // Get the first TikTok upload tab
    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length === 0) {
      console.log("No TikTok upload page found.");
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      return;
    }

    const uploadTab = uploadTabs[0];

    // Set the schedule on the upload page
    chrome.tabs.sendMessage(
      uploadTab.id,
      {
        action: "SET_SCHEDULE",
        data: {
          hour: hour,
          minute: minute,
        },
      },
      (scheduleResponse) => {
        if (chrome.runtime.lastError) {
          console.error("Error setting schedule:", chrome.runtime.lastError);
          btn.innerHTML = originalHTML;
          btn.disabled = false;
          return;
        }

        if (scheduleResponse && scheduleResponse.success) {
          console.log("Schedule set successfully!");

          // Store the schedule time for this video
          const scheduleData = {
            videoId: video.id,
            hour: hour,
            minute: minute,
            timestamp: Date.now(),
          };

          chrome.storage.local.set({
            [`schedule_${video.id}`]: scheduleData,
          });

          btn.innerHTML = '<i class="fas fa-check"></i> Set!';
          btn.style.background = "rgba(34, 197, 94, 0.2)";
          btn.style.color = "#22c55e";
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = "";
            btn.style.color = "";
            btn.disabled = false;
          }, 2000);
        } else {
          console.error("Schedule failed:", scheduleResponse?.error);
          btn.innerHTML = '<i class="fas fa-times"></i> Failed';
          btn.style.color = "#ef4444";
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = "";
            btn.disabled = false;
          }, 2000);
        }
      },
    );
  } catch (error) {
    console.error("Error in handleSetScheduleClick:", error);
    btn.innerHTML = '<i class="fas fa-times"></i> Error';
    btn.style.color = "#ef4444";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
      btn.disabled = false;
    }, 2000);
  }
}

async function handleScheduleNowClick(video, hourSelect, minuteSelect, btn) {
  console.log("Schedule Now button clicked for video:", video.id);

  const hour = hourSelect ? hourSelect.value : "";
  const minute = minuteSelect ? minuteSelect.value : "";

  if (!hour || !minute) {
    alert("Please select both hour and minute for scheduling");
    return;
  }

  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    console.log("User not on TikTok upload page. Schedule aborted.");
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
  btn.disabled = true;

  try {
    // Get the first TikTok upload tab
    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length === 0) {
      console.log("No TikTok upload page found.");
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      return;
    }

    const uploadTab = uploadTabs[0];
    const caption = video.tone || `${video.title} - ${video.price}`;

    // First, upload the video and set caption
    chrome.tabs.sendMessage(
      uploadTab.id,
      {
        action: "UPLOAD_VIDEO",
        data: {
          taskId: video.id,
          videoUrl: video.complete_video || video.video_url,
          caption: caption,
        },
      },
      async (uploadResponse) => {
        if (chrome.runtime.lastError) {
          console.error("Error uploading video:", chrome.runtime.lastError);
          btn.innerHTML = originalHTML;
          btn.disabled = false;
          return;
        }

        if (!uploadResponse || !uploadResponse.success) {
          console.error("Upload failed:", uploadResponse?.error);
          btn.innerHTML = originalHTML;
          btn.disabled = false;
          return;
        }

        // Wait for video processing
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Now set the schedule
        chrome.tabs.sendMessage(
          uploadTab.id,
          {
            action: "SET_SCHEDULE",
            data: {
              hour: hour,
              minute: minute,
            },
          },
          async (scheduleResponse) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error setting schedule:",
                chrome.runtime.lastError,
              );
              btn.innerHTML = originalHTML;
              btn.disabled = false;
              return;
            }

            if (scheduleResponse && scheduleResponse.success) {
              console.log("Schedule set successfully!");

              // Now click the post/schedule button (same as Post Now)
              chrome.tabs.sendMessage(
                uploadTab.id,
                {
                  action: "CLICK_POST",
                  data: { taskId: video.id },
                },
                (postResponse) => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      "Error clicking post button:",
                      chrome.runtime.lastError,
                    );
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    return;
                  }

                  if (postResponse && postResponse.success) {
                    // Send webhook after schedule is successful
                    sendWebhookEvent(
                      "schedule_success",
                      video.id,
                      "schedule_now",
                    );

                    btn.innerHTML = '<i class="fas fa-check"></i> Scheduled!';
                    btn.style.background = "rgba(59, 130, 246, 0.2)";
                    btn.style.color = "#3b82f6";
                    setTimeout(() => {
                      btn.innerHTML = originalHTML;
                      btn.style.background = "";
                      btn.style.color = "";
                      btn.disabled = false;
                    }, 3000);
                  } else {
                    console.error("Post failed:", postResponse?.error);
                    btn.innerHTML = '<i class="fas fa-times"></i> Failed';
                    btn.style.color = "#ef4444";
                    setTimeout(() => {
                      btn.innerHTML = originalHTML;
                      btn.style.color = "";
                      btn.disabled = false;
                    }, 2000);
                  }
                },
              );
            } else {
              console.error("Schedule failed:", scheduleResponse?.error);
              btn.innerHTML = '<i class="fas fa-times"></i> Failed';
              btn.style.color = "#ef4444";
              setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.color = "";
                btn.disabled = false;
              }, 2000);
            }
          },
        );
      },
    );
  } catch (error) {
    console.error("Error in handleScheduleNowClick:", error);
    btn.innerHTML = '<i class="fas fa-times"></i> Error';
    btn.style.color = "#ef4444";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
      btn.disabled = false;
    }, 2000);
  }
}

async function handleAutoScheduleClick(video, btn, hourSelect, minuteSelect) {
  console.log("Auto Schedule button clicked for video:", video.id);

  // Check if user has premium plan for auto-schedule feature
  if (!checkPremiumFeatureAccess("Auto Schedule")) {
    console.log("Auto Schedule feature requires premium plan");
    return;
  }

  const hour = hourSelect ? hourSelect.value : "";
  const minute = minuteSelect ? minuteSelect.value : "";

  if (!hour || !minute) {
    alert("Please select both hour and minute for scheduling");
    return;
  }

  const isOnUploadPage = await checkUploadPageStatus();
  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    console.log("User not on TikTok upload page. Auto Schedule aborted.");
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auto Scheduling...';
  btn.disabled = true;

  try {
    // Get the first TikTok upload tab
    const allTabs = await chrome.tabs.query({});
    const uploadTabs = allTabs.filter((tab) => {
      if (!tab.url) return false;
      const url = tab.url.toLowerCase();
      return (
        url.includes("tiktok.com/upload") ||
        url.includes("tiktok.com/tiktokstudio/upload")
      );
    });

    if (uploadTabs.length === 0) {
      console.log("No TikTok upload page found.");
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      return;
    }

    const uploadTab = uploadTabs[0];
    const caption = video.tone || `${video.title} - ${video.price}`;
    const hasProductId =
      video.product_id &&
      video.product_id.trim() !== "" &&
      video.product_id !== "manual" &&
      video.product_id !== "none";

    // Helper function to send message with retry logic
    async function sendMessageWithRetry(action, data, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Attempt ${attempt} to send ${action} message...`);

          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
              uploadTab.id,
              { action, data },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              },
            );
          });

          console.log(
            `${action} message sent successfully on attempt ${attempt}`,
          );
          return response;
        } catch (error) {
          console.warn(
            `Attempt ${attempt} failed for ${action}:`,
            error.message,
          );

          if (attempt < maxRetries) {
            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));

            // Try to inject content script if it's not loaded
            if (error.message.includes("Receiving end does not exist")) {
              console.log("Attempting to inject content script...");
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: uploadTab.id },
                  files: ["content.js"],
                });
                console.log("Content script injected successfully");
                await new Promise((resolve) => setTimeout(resolve, 1000));
              } catch (injectError) {
                console.warn(
                  "Failed to inject content script:",
                  injectError.message,
                );
              }
            }
          } else {
            throw error;
          }
        }
      }
    }

    // Step 1: Upload video
    console.log("Step 1: Uploading video...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    const uploadResult = await sendMessageWithRetry("UPLOAD_VIDEO", {
      taskId: video.id,
      videoUrl: video.complete_video || video.video_url,
      caption: caption,
    });

    if (!uploadResult || !uploadResult.success) {
      console.error("Upload failed:", uploadResult?.error);
      btn.innerHTML = '<i class="fas fa-times"></i> Upload Failed';
      btn.style.color = "#ef4444";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
        btn.disabled = false;
      }, 2000);
      return;
    }

    // Wait for video processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 2: Set caption
    console.log("Step 2: Setting caption...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting caption...';

    const captionResult = await sendMessageWithRetry("SET_CAPTION", {
      caption: caption,
    });

    if (!captionResult || !captionResult.success) {
      console.warn("Caption setting failed:", captionResult?.error);
      // Continue anyway - caption might already be set from upload
    }

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 3: Add product ID if available
    if (hasProductId) {
      console.log("Step 3: Adding product ID...");
      btn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Adding product...';

      const productResult = await sendMessageWithRetry("ADD_PRODUCT", {
        productId: video.product_id,
      });

      if (!productResult || !productResult.success) {
        console.warn("Product addition failed:", productResult?.error);
        // Continue anyway - product might not be required
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Step 4: Enable AI content
    console.log("Step 4: Enabling AI content...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enabling AI...';

    const aiResult = await sendMessageWithRetry("TOGGLE_AI_CONTENT", {});

    if (!aiResult || !aiResult.success) {
      console.warn("AI content enabling failed:", aiResult?.error);
      // Continue anyway - AI might already be enabled or not available
    }

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 5: Set schedule time
    console.log("Step 5: Setting schedule time...");
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Setting schedule...';

    const scheduleResult = await sendMessageWithRetry("SET_SCHEDULE", {
      hour: hour,
      minute: minute,
    });

    if (!scheduleResult || !scheduleResult.success) {
      console.warn("Schedule setting failed:", scheduleResult?.error);
      // Continue anyway - schedule might not be required or already set
    }

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 6: Click Post button (which will be "Schedule" button when schedule time is set)
    console.log("Step 6: Clicking Post/Schedule button...");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';

    const postResult = await sendMessageWithRetry("CLICK_POST", {
      taskId: video.id,
    });

    if (postResult && postResult.success) {
      console.log("Auto Schedule completed successfully!");

      // Send webhook after schedule is successful
      sendWebhookEvent("schedule_success", video.id, "auto_schedule");

      btn.innerHTML = '<i class="fas fa-check"></i> Auto Scheduled!';
      btn.style.background = "rgba(59, 130, 246, 0.2)";
      btn.style.color = "#3b82f6";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = "";
        btn.style.color = "";
        btn.disabled = false;
      }, 3000);
    } else {
      console.error("Schedule failed:", postResult?.error);
      btn.innerHTML = '<i class="fas fa-times"></i> Schedule Failed';
      btn.style.color = "#ef4444";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error("Error in handleAutoScheduleClick:", error);
    btn.innerHTML = '<i class="fas fa-times"></i> Error';
    btn.style.color = "#ef4444";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
      btn.disabled = false;
    }, 2000);
  }
}

// Debug modal function
function showDebugModal() {
  // Create modal container
  const modal = document.createElement("div");
  modal.id = "debugModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;

  // Create modal content
  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-radius: 16px;
    padding: 24px;
    max-width: 800px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    border: 1px solid #475569;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  `;

  // Create header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #475569;
  `;

  const title = document.createElement("h2");
  title.textContent = "Token Sync Debug";
  title.style.cssText = `
    color: #f1f5f9;
    font-size: 20px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  title.innerHTML = '<i class="fas fa-bug"></i> Token Sync Debug';

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.style.cssText = `
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  `;
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "rgba(239, 68, 68, 0.3)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "rgba(239, 68, 68, 0.2)";
  });
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create debug info container
  const debugInfo = document.createElement("div");
  debugInfo.id = "debugInfoContent";
  debugInfo.style.cssText = `
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    line-height: 1.4;
  `;

  // Create test buttons
  const testButtons = document.createElement("div");
  testButtons.style.cssText = `
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  `;

  const tests = [
    { id: "testStorageBtn", label: "Test Storage", icon: "fa-database" },
    { id: "testCookiesBtn", label: "Test Cookies", icon: "fa-cookie" },
    { id: "testWebAppBtn", label: "Test Web App", icon: "fa-globe" },
    { id: "testAuthBtn", label: "Test Auth", icon: "fa-key" },
    {
      id: "clearStorageBtn",
      label: "Clear Storage",
      icon: "fa-trash",
      warning: true,
    },
    {
      id: "forceRefreshBtn",
      label: "Force Refresh",
      icon: "fa-redo",
      warning: true,
    },
  ];

  tests.forEach((test) => {
    const btn = document.createElement("button");
    btn.id = test.id;
    btn.innerHTML = `<i class="fas ${test.icon}"></i> ${test.label}`;
    btn.style.cssText = `
      padding: 8px 12px;
      background: ${test.warning ? "rgba(245, 158, 11, 0.2)" : "rgba(59, 130, 246, 0.2)"};
      color: ${test.warning ? "#f59e0b" : "#3b82f6"};
      border: 1px solid ${test.warning ? "rgba(245, 158, 11, 0.4)" : "rgba(59, 130, 246, 0.4)"};
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = test.warning
        ? "rgba(245, 158, 11, 0.3)"
        : "rgba(59, 130, 246, 0.3)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = test.warning
        ? "rgba(245, 158, 11, 0.2)"
        : "rgba(59, 130, 246, 0.2)";
    });
    testButtons.appendChild(btn);
  });

  // Create results container
  const results = document.createElement("div");
  results.id = "debugResults";
  results.style.cssText = `
    background: rgba(15, 23, 42, 0.8);
    border-radius: 8px;
    padding: 12px;
    margin-top: 16px;
    border: 1px solid #475569;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 11px;
  `;

  // Assemble modal
  modalContent.appendChild(header);
  modalContent.appendChild(testButtons);
  modalContent.appendChild(debugInfo);
  modalContent.appendChild(results);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Load initial debug info
  updateDebugInfo();

  // Add event listeners for test buttons
  document
    .getElementById("testStorageBtn")
    .addEventListener("click", testStorageDebug);
  document
    .getElementById("testCookiesBtn")
    .addEventListener("click", testCookiesDebug);
  document
    .getElementById("testWebAppBtn")
    .addEventListener("click", testWebAppDebug);
  document
    .getElementById("testAuthBtn")
    .addEventListener("click", testAuthDebug);
  document
    .getElementById("clearStorageBtn")
    .addEventListener("click", clearStorageDebug);
  document
    .getElementById("forceRefreshBtn")
    .addEventListener("click", forceRefreshDebug);

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function updateDebugInfo() {
  const debugInfo = document.getElementById("debugInfoContent");
  if (!debugInfo) return;

  let html = `
    <div style="margin-bottom: 12px; color: #94a3b8; font-size: 11px;">
      <strong>Current User:</strong> ${currentUser ? currentUser.email || currentUser.id || "Unknown" : "Not logged in"}
    </div>
    <div style="margin-bottom: 12px; color: #94a3b8; font-size: 11px;">
      <strong>Chrome APIs:</strong> ${typeof chrome !== "undefined" ? "Available" : "Not available"}
    </div>
    <div style="margin-bottom: 12px; color: #94a3b8; font-size: 11px;">
      <strong>Extension ID:</strong> ${chrome.runtime?.id || "Unknown"}
    </div>
    <div style="margin-bottom: 12px; color: #94a3b8; font-size: 11px;">
      <strong>API Base URL:</strong> ${API_BASE_URL}
    </div>
  `;

  debugInfo.innerHTML = html;
}

function addDebugResult(message, type = "info") {
  const results = document.getElementById("debugResults");
  if (!results) return;

  const resultItem = document.createElement("div");
  resultItem.style.cssText = `
    padding: 6px 8px;
    margin-bottom: 4px;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 4px;
    border-left: 3px solid ${type === "success" ? "#10b981" : type === "error" ? "#ef4444" : type === "warning" ? "#f59e0b" : "#3b82f6"};
    color: ${type === "success" ? "#a7f3d0" : type === "error" ? "#fca5a5" : type === "warning" ? "#fde68a" : "#bfdbfe"};
  `;

  const timestamp = new Date().toLocaleTimeString();
  resultItem.textContent = `[${timestamp}] ${message}`;

  results.appendChild(resultItem);
  results.scrollTop = results.scrollHeight;
}

async function testStorageDebug() {
  addDebugResult("Testing Chrome storage...", "info");

  try {
    const result = await getFromStorage(STORAGE_KEYS.USER);
    if (result) {
      addDebugResult(
        `✅ Found user in storage: ${result.email || result.id || "Unknown"}`,
        "success",
      );
    } else {
      addDebugResult("⚠️ No user found in storage", "warning");
    }
  } catch (error) {
    addDebugResult(`❌ Storage test failed: ${error.message}`, "error");
  }
}

async function testCookiesDebug() {
  addDebugResult("Testing cookies...", "info");

  try {
    const cookies = await new Promise((resolve, reject) => {
      chrome.cookies.getAll({ url: API_BASE_URL }, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(cookies);
        }
      });
    });

    addDebugResult(
      `✅ Found ${cookies.length} cookies for ${API_BASE_URL}`,
      "success",
    );

    const authCookies = cookies.filter(
      (cookie) =>
        cookie.name.includes("session") ||
        cookie.name.includes("auth") ||
        cookie.name.includes("token") ||
        cookie.name.includes("user"),
    );

    if (authCookies.length > 0) {
      addDebugResult(`✅ Found ${authCookies.length} auth cookies`, "success");
      authCookies.forEach((cookie) => {
        addDebugResult(
          `   • ${cookie.name}: ${cookie.value.substring(0, 20)}...`,
          "info",
        );
      });
    } else {
      addDebugResult("⚠️ No auth cookies found", "warning");
      addDebugResult(
        "💡 Please log into https://automatorx.co in this browser",
        "info",
      );
      addDebugResult(
        "💡 Make sure you're using the same browser profile",
        "info",
      );
      addDebugResult(
        "💡 Check if cookies are being blocked by browser settings",
        "info",
      );
    }
  } catch (error) {
    addDebugResult(`❌ Cookies test failed: ${error.message}`, "error");
  }
}

async function testWebAppDebug() {
  addDebugResult("Testing web app connection...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`);

    if (response.status === 401) {
      addDebugResult(
        "✅ Web app API is accessible (401 Unauthorized expected)",
        "success",
      );
    } else if (response.ok) {
      const data = await response.json();
      addDebugResult(
        `✅ Web app API is accessible. User: ${data.user?.email || data.user?.id || "Unknown"}`,
        "success",
      );
    } else {
      addDebugResult(
        `⚠️ Web app API returned status: ${response.status}`,
        "warning",
      );
    }
  } catch (error) {
    addDebugResult(`❌ Web app connection failed: ${error.message}`, "error");
  }
}

async function testAuthDebug() {
  addDebugResult("Testing authentication...", "info");

  try {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
      addDebugResult(
        `✅ Authentication successful. User: ${currentUser?.email || currentUser?.id || "Unknown"}`,
        "success",
      );
      updateDebugInfo();
    } else {
      addDebugResult("❌ Authentication failed", "error");
    }
  } catch (error) {
    addDebugResult(`❌ Auth test failed: ${error.message}`, "error");
  }
}

async function clearStorageDebug() {
  addDebugResult("Clearing storage...", "warning");

  try {
    await clearUserStorage();
    addDebugResult("✅ Storage cleared successfully", "success");
    updateDebugInfo();
  } catch (error) {
    addDebugResult(`❌ Failed to clear storage: ${error.message}`, "error");
  }
}

async function forceRefreshDebug() {
  addDebugResult("Force refreshing authentication...", "warning");

  try {
    await clearUserStorage();
    addDebugResult("✅ Storage cleared", "success");

    const isAuthenticated = await checkAuth(true);
    if (isAuthenticated) {
      addDebugResult(
        `✅ Force refresh successful. User: ${currentUser?.email || currentUser?.id || "Unknown"}`,
        "success",
      );
      updateDebugInfo();
    } else {
      addDebugResult("❌ Force refresh failed", "error");
    }
  } catch (error) {
    addDebugResult(`❌ Force refresh failed: ${error.message}`, "error");
  }
}

// Manual login modal
function showManualLoginModal() {
  // Create modal container
  const modal = document.createElement("div");
  modal.id = "manualLoginModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;

  // Create modal content
  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
    border: 1px solid #475569;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  `;

  // Create header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #475569;
  `;

  const title = document.createElement("h2");
  title.textContent = "Manual Login";
  title.style.cssText = `
    color: #f1f5f9;
    font-size: 20px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  title.innerHTML = '<i class="fas fa-key"></i> Manual Login';

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.style.cssText = `
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  `;
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "rgba(239, 68, 68, 0.3)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "rgba(239, 68, 68, 0.2)";
  });
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modal);
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create form
  const form = document.createElement("form");
  form.id = "manualLoginForm";
  form.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
  `;

  // Email input
  const emailGroup = document.createElement("div");
  emailGroup.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  const emailLabel = document.createElement("label");
  emailLabel.textContent = "Email";
  emailLabel.style.cssText = `
    color: #94a3b8;
    font-size: 14px;
    font-weight: 500;
  `;

  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.id = "manualLoginEmail";
  emailInput.placeholder = "your@email.com";
  emailInput.required = true;
  emailInput.style.cssText = `
    padding: 12px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #475569;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 14px;
    transition: all 0.2s;
  `;
  emailInput.addEventListener("focus", () => {
    emailInput.style.borderColor = "#3b82f6";
    emailInput.style.boxShadow = "0 0 0 2px rgba(59, 130, 246, 0.2)";
  });
  emailInput.addEventListener("blur", () => {
    emailInput.style.borderColor = "#475569";
    emailInput.style.boxShadow = "none";
  });

  emailGroup.appendChild(emailLabel);
  emailGroup.appendChild(emailInput);

  // Password input
  const passwordGroup = document.createElement("div");
  passwordGroup.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  const passwordLabel = document.createElement("label");
  passwordLabel.textContent = "Password";
  passwordLabel.style.cssText = `
    color: #94a3b8;
    font-size: 14px;
    font-weight: 500;
  `;

  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.id = "manualLoginPassword";
  passwordInput.placeholder = "••••••••";
  passwordInput.required = true;
  passwordInput.style.cssText = `
    padding: 12px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #475569;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 14px;
    transition: all 0.2s;
  `;
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "#3b82f6";
    passwordInput.style.boxShadow = "0 0 0 2px rgba(59, 130, 246, 0.2)";
  });
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "#475569";
    passwordInput.style.boxShadow = "none";
  });

  passwordGroup.appendChild(passwordLabel);
  passwordGroup.appendChild(passwordInput);

  // Submit button
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.id = "manualLoginSubmit";
  submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
  submitBtn.style.cssText = `
    padding: 12px;
    background: linear-gradient(90deg, #8b5cf6 0%, #06b6d4 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  `;
  submitBtn.addEventListener("mouseenter", () => {
    submitBtn.style.opacity = "0.9";
  });
  submitBtn.addEventListener("mouseleave", () => {
    submitBtn.style.opacity = "1";
  });

  // Status message
  const statusDiv = document.createElement("div");
  statusDiv.id = "manualLoginStatus";
  statusDiv.style.cssText = `
    margin-top: 12px;
    padding: 8px;
    border-radius: 6px;
    font-size: 14px;
    text-align: center;
    display: none;
  `;

  // Assemble form
  form.appendChild(emailGroup);
  form.appendChild(passwordGroup);
  form.appendChild(submitBtn);

  // Assemble modal
  modalContent.appendChild(header);
  modalContent.appendChild(form);
  modalContent.appendChild(statusDiv);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Add form submit handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showManualLoginStatus("Please enter both email and password", "error");
      return;
    }

    await handleManualLogin(email, password, submitBtn, statusDiv);
  });

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Focus email input
  setTimeout(() => emailInput.focus(), 100);
}

function showManualLoginStatus(message, type = "info") {
  const statusDiv = document.getElementById("manualLoginStatus");
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.style.display = "block";

  switch (type) {
    case "success":
      statusDiv.style.background = "rgba(34, 197, 94, 0.2)";
      statusDiv.style.color = "#22c55e";
      statusDiv.style.border = "1px solid rgba(34, 197, 94, 0.4)";
      break;
    case "error":
      statusDiv.style.background = "rgba(239, 68, 68, 0.2)";
      statusDiv.style.color = "#ef4444";
      statusDiv.style.border = "1px solid rgba(239, 68, 68, 0.4)";
      break;
    case "warning":
      statusDiv.style.background = "rgba(245, 158, 11, 0.2)";
      statusDiv.style.color = "#f59e0b";
      statusDiv.style.border = "1px solid rgba(245, 158, 11, 0.4)";
      break;
    default:
      statusDiv.style.background = "rgba(59, 130, 246, 0.2)";
      statusDiv.style.color = "#3b82f6";
      statusDiv.style.border = "1px solid rgba(59, 130, 246, 0.4)";
  }
}

async function handleManualLogin(email, password, submitBtn, statusDiv) {
  const originalHTML = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
  submitBtn.disabled = true;

  showManualLoginStatus("Attempting to login...", "info");

  try {
    // Try to login via the API
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.user) {
        // Store user data
        currentUser = data.user;
        await saveToStorage(STORAGE_KEYS.USER, currentUser);

        // Update UI
        updateUserUI();
        hideLoginContainer();

        showManualLoginStatus(
          "Login successful! Loading your data...",
          "success",
        );

        // Load user data
        await loadAllData();

        // Close modal after success
        setTimeout(() => {
          const modal = document.getElementById("manualLoginModal");
          if (modal) {
            document.body.removeChild(modal);
          }
        }, 1500);
      } else {
        showManualLoginStatus("Login failed: No user data returned", "error");
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.message || `Login failed with status ${response.status}`;
      showManualLoginStatus(`Login failed: ${errorMessage}`, "error");
    }
  } catch (error) {
    console.error("Manual login error:", error);
    showManualLoginStatus(`Login error: ${error.message}`, "error");
  } finally {
    submitBtn.innerHTML = originalHTML;
    submitBtn.disabled = false;
  }
}

// Export for background script
window.TikTokAutomatorExtension = {
  checkAuth,
  loadVideos,
  loadProducts,
  loadAccounts,
  getCurrentUser: () => currentUser,
  showVideoPlayer,
  hideVideoPlayer,
  checkUploadPageStatus,
  updateUploadButtonsStatus,
  setPostMode,
  getCurrentPostMode: () => currentPostMode,
  handleSetScheduleClick,
  handleScheduleNowClick,
  handleAutoScheduleClick,
};
