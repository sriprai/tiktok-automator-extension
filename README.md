# TikTok Video Automator Chrome Extension

A Chrome extension for the TikTok Video Automator web application that allows users to view their video library, products, and TikTok accounts directly from the browser.

## Features

### 1. Video Library

- View all videos from your TikTok Video Automator account
- Filter videos by status (Completed, Ready to Post, Posted to TikTok)
- See video thumbnails, titles, and creation dates
- Click to open videos in new tabs

### 2. Products Management

- View products associated with your videos
- See product IDs, titles, prices, and status
- Products are extracted from your video library

### 3. TikTok Accounts

- View connected TikTok accounts
- See account nicknames, handles, and avatars
- Monitor account status

### 4. Authentication

- Automatically detects when you're logged into the web app
- Uses same session/cookies as the web application
- Shows login prompt when not authenticated

### 5. TikTok Automation

- Automate video uploads to TikTok
- Set cookies for TikTok authentication
- Auto-fill captions and add products
- Monitor upload progress

## Installation

### Development Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project
5. The extension should now appear in your extensions list

### Production Installation

Once published to Chrome Web Store:

1. Visit the Chrome Web Store listing
2. Click "Add to Chrome"
3. Confirm the installation

## Configuration

### API Base URL

By default, the extension connects to `http://localhost:3000`. To change this:

1. Open `popup.js`
2. Modify the `API_BASE_URL` constant:
   ```javascript
   const API_BASE_URL = "https://your-production-url.com";
   ```

### Permissions

The extension requires the following permissions:

- `storage`: Save user preferences and data
- `activeTab`: Interact with current tab
- `scripting`: Inject scripts into TikTok pages
- `cookies`: Set TikTok authentication cookies
- `tabs`: Open new tabs and manage them
- Host permissions for TikTok and your web app domains

## Usage

### Basic Usage

1. **Login to Web App**: First, log into the TikTok Video Automator web application
2. **Click Extension Icon**: Click the extension icon in Chrome toolbar
3. **View Your Data**: Browse your videos, products, and accounts in the popup
4. **Refresh Data**: Use the refresh buttons to update information

### Video Upload Automation

1. **Prepare Video**: Ensure you have a completed video in your library
2. **Connect TikTok Account**: Make sure you have a TikTok account connected in the web app
3. **Start Upload**: The extension can automate the upload process when triggered from the web app

### Manual Testing

You can test the extension manually by:

1. Opening the popup and checking if you're logged in
2. Clicking on video cards to open them
3. Using the refresh buttons to load data
4. Checking the console for debugging information (F12 → Console)

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Popup UI
├── popup.css             # Popup styles
├── popup.js              # Popup functionality
├── background.js         # Background service worker
├── content.js            # TikTok page automation
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

## Development

### Prerequisites

- Chrome browser (version 88 or higher)
- Basic knowledge of JavaScript, HTML, and CSS
- Access to the TikTok Video Automator web application

### Building

No build process required for development. The extension uses vanilla JavaScript.

### Testing

1. Load the extension in Chrome (see Installation)
2. Open the popup and verify it loads
3. Check console for errors (F12 → Console)
4. Test each feature individually

### Debugging

- **Popup**: Right-click extension icon → "Inspect popup"
- **Background Script**: Go to `chrome://extensions/` → find extension → "Service Worker"
- **Content Script**: Open TikTok page → F12 → Console

## Integration with Web App

The extension integrates with the existing TikTok Video Automator web app:

### Authentication

- Uses the same session cookies as the web app
- Calls `/api/auth/me` to get user information
- Stores user data in Chrome storage

### API Endpoints Used

- `GET /api/auth/me` - Get current user
- `GET /api/video-tasks` - Get video library
- `GET /api/tiktok/accounts` - Get TikTok accounts

### Communication

- Web app can send messages to extension using `chrome.runtime.sendMessage`
- Extension responds to `EXTENSION_ID_REQUEST` for detection
- Supports `POST_VIDEO` action for automation

## Security Considerations

1. **Permissions**: Only requests necessary permissions
2. **Data Storage**: User data stored locally in Chrome storage
3. **API Calls**: Uses same authentication as web app
4. **Content Scripts**: Only runs on TikTok.com domains
5. **Cookies**: Only sets cookies for TikTok.com domain

## Troubleshooting

### Common Issues

1. **Extension not loading**: Check Chrome console for errors
2. **Authentication failing**: Ensure you're logged into the web app
3. **Data not loading**: Check network requests in popup dev tools
4. **Icons not showing**: Verify icon paths in manifest.json

### Error Messages

- "Login Required": You need to log into the web app first
- "Failed to load videos": API request failed or no videos
- "Extension not detected": Web app can't communicate with extension

## Future Enhancements

1. **Offline Support**: Cache data for offline viewing
2. **Notifications**: Alert for new videos or uploads
3. **Bulk Actions**: Select multiple videos for operations
4. **Advanced Filtering**: More filter options for videos
5. **Export Data**: Export video/product lists as CSV
6. **Dark/Light Mode**: Theme switching
7. **Keyboard Shortcuts**: Quick actions with keyboard

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review console errors
3. Contact development team
4. Check web app documentation

## License

[Your License Here]

## Credits

Developed for TikTok Video Automator project.
