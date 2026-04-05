/**
 * Background Service Worker — Coursera VI Subtitle
 * Chuyển tiếp message giữa popup và content script
 * Phase 2: Gọi Python Translation Server
 * Auto-inject content script khi tab chưa có (sau extension reload)
 */

const SERVER_URL = 'http://localhost:8765';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'FORWARD_TO_TAB':
      // Tìm tab Coursera đang active và forward message
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        const tabId = tabs[0].id;

        // Thử gửi trực tiếp trước
        chrome.tabs.sendMessage(tabId, message.payload, (response) => {
          if (chrome.runtime.lastError) {
            // Content script chưa inject → tự inject rồi retry
            console.log('[BG] Content script not found, injecting...');
            injectAndRetry(tabId, message.payload, sendResponse);
            return;
          }
          sendResponse(response || { success: false, error: 'No response from tab' });
        });
      });
      return true;

    case 'CHECK_SERVER':
      fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(data => sendResponse({ online: true, data }))
        .catch(() => sendResponse({ online: false }));
      return true;

    case 'GET_ENGINES':
      fetch(`${SERVER_URL}/engines`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_GLOSSARY':
      fetch(`${SERVER_URL}/glossary`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

/**
 * Inject content script + CSS vào tab, rồi retry gửi message
 */
async function injectAndRetry(tabId, payload, sendResponse) {
  try {
    // Inject CSS trước
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/overlay.css'],
    });

    // Inject JS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/subtitle-parser.js', 'content/content.js'],
    });

    console.log('[BG] Content script injected successfully');

    // Đợi content script khởi tạo xong
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: 'Inject OK nhưng không kết nối được. Hãy F5 trang Coursera.',
          });
          return;
        }
        sendResponse(response || { success: true });
      });
    }, 500);

  } catch (err) {
    console.error('[BG] Inject failed:', err.message);
    sendResponse({
      success: false,
      error: `Không inject được: ${err.message}. Hãy F5 trang Coursera.`,
    });
  }
}
