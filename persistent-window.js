// Additional JavaScript for persistent window
document.addEventListener("DOMContentLoaded", function () {
  // Window control buttons
  const refreshBtn = document.querySelector(".window-btn.refresh");
  const closeBtn = document.querySelector(".window-btn.close");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      // Trigger refresh of all data
      if (
        window.TikTokAutomatorExtension &&
        window.TikTokAutomatorExtension.loadVideos
      ) {
        window.TikTokAutomatorExtension.loadVideos();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      // Close the window
      window.close();
    });
  }

  // Make the window stay on top (optional)
  // Note: This requires additional permissions and may not work in all browsers
  try {
    // Try to keep window focused
    window.focus();
  } catch (e) {
    console.log("Could not focus window:", e);
  }
});
