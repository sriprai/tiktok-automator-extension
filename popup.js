// TikTok Video Automator Chrome Extension
// Main popup functionality

// Configuration
const API_BASE_URL = "https://automatorx.thairiches.com"; // Change to your production URL
const STORAGE_KEYS = {
  USER: "tiktok_automator_user",
  TOKEN: "tiktok_automator_token",
  LAST_SYNC: "tiktok_automator_last_sync",
};

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
        return true;
      }
    }

    // Try to get user ID from web app via message
    try {
      const userId = await getUserIdFromWebApp();
      if (userId) {
        // Try to fetch user data with the user ID
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId.toString(),
          },
        });

        if (response.ok) {
          const data = await response.json();
          currentUser = data.user;
          await saveToStorage(STORAGE_KEYS.USER, currentUser);
          updateUserUI();
          hideLoginContainer();
          return true;
        }
      }
    } catch (webAppError) {
      console.log("Could not get user ID from web app:", webAppError);
    }

    // Fallback: Try to fetch current user from API without auth
    // This will likely fail but we try anyway
    const response = await fetch(`${API_BASE_URL}/api/auth/me`);

    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      await saveToStorage(STORAGE_KEYS.USER, currentUser);
      updateUserUI();
      hideLoginContainer();
      return true;
    } else {
      showLoginContainer();
      return false;
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    showLoginContainer();
    return false;
  }
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

  // Update user info
  userInfoEl.innerHTML = `
        <div class="logged-in">
            <div class="avatar">${avatarChar}</div>
            <div class="email">${userEmail}</div>
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

  console.log("User UI updated:", { userName, userEmail, userCredits });
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
  } else {
    // Manual Schedule and Auto Schedule: Hide all for testing
    videoActionsHTML = `
      <div class="video-actions-placeholder">
        <p style="font-size: 10px; color: #94a3b8; text-align: center; padding: 8px;">
          Actions hidden for ${currentPostMode.replace("-", " ")} mode
        </p>
      </div>
    `;
  }

  card.innerHTML = `
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
    // Don't trigger if clicking on action buttons
    if (e.target.closest(".video-actions")) {
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
      handleProductIdClick(video.product_id, productIdTooltip);
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
      chrome.runtime.sendMessage(
        {
          action: "FETCH_API",
          url: url,
          options: {
            ...options,
            headers: {
              "Content-Type": "application/json",
              ...options.headers,
              ...(currentUser?.id
                ? { "x-user-id": currentUser.id.toString() }
                : {}),
            },
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
      credits_used: buttonType === "auto_post" ? 5 : 0, // Auto Post uses 5 credits, Post Now uses 0
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
    ".upload-btn, .caption-btn, .product-id-btn, .ai-content-btn, .post-tiktok-btn, .auto-post-btn",
  );

  actionButtons.forEach((btn) => {
    if (isOnUploadPage) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.filter = "none";
      if (btn.classList.contains("upload-btn")) btn.title = "Upload to TikTok";
      if (btn.classList.contains("caption-btn")) btn.title = "Fill Caption";
      if (btn.classList.contains("product-id-btn")) btn.title = "Add Product";
      if (btn.classList.contains("ai-content-btn")) btn.title = "AI Content";
      if (btn.classList.contains("post-tiktok-btn")) btn.title = "Post Now";
      if (btn.classList.contains("auto-post-btn")) btn.title = "Auto Post";
    } else {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.style.filter = "grayscale(100%)";
      btn.title = "Please open TikTok upload page first";
    }
  });
}

async function handleUploadClick(video) {
  console.log("Upload button clicked for video:", video.id);

  // Check if user is on TikTok upload page
  const isOnUploadPage = await checkUploadPageStatus();

  if (!isOnUploadPage) {
    alert("Please open TikTok upload page first");
    console.log("User not on TikTok upload page. Upload aborted.");
    return;
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

async function handleProductIdClick(productId, tooltip) {
  console.log("Product ID button clicked:", productId);

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
              const productIdBtns =
                document.querySelectorAll(".product-id-btn");
              productIdBtns.forEach((btn) => {
                if (btn.dataset.productId === productId) {
                  btn.innerHTML = '<i class="fas fa-check"></i> Added!';
                }
              });
            } else if (response && response.error) {
              console.error("Failed to add product:", response.error);
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
};
