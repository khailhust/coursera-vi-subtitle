/**
 * Background Service Worker — Coursera VI Subtitle
 * Chuyển tiếp message giữa popup và content script
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FORWARD_TO_TAB') {
    // Tìm tab Coursera đang active và forward message
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message.payload, (response) => {
          // Xử lý lỗi khi content script chưa inject
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response || { success: false, error: 'No response from tab' });
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true; // Giữ channel mở cho async response
  }

  // Phase 2: Xử lý TRANSLATE_FILE → gọi Python server
  if (message.type === 'TRANSLATE_FILE') {
    // TODO Phase 2: fetch('http://localhost:8765/translate', ...)
    sendResponse({ success: false, error: 'Translation server not implemented yet (Phase 2)' });
    return true;
  }

  // Phase 2: Check server status
  if (message.type === 'CHECK_SERVER') {
    fetch('http://localhost:8765/health')
      .then(res => res.json())
      .then(data => sendResponse({ online: true, data }))
      .catch(() => sendResponse({ online: false }));
    return true;
  }
});
