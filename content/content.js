/**
 * Content Script — Coursera VI Subtitle
 * Inject vào trang Coursera, hiển thị phụ đề tiếng Việt overlay trên video
 * Hỗ trợ: kéo thả tự do, fullscreen, F5 persistence, SPA navigation
 */

// === STATE ===
let subtitles = [];
let overlayDiv = null;
let isEnabled = true;
let syncOffset = 0;
let overlayPosition = null;  // {centerX, top} vị trí tâm (px từ viewport)
let dragHintShown = false;

// === GUARD: Kiểm tra extension context còn hợp lệ không ===
// Khi extension bị reload, content script cũ vẫn chạy nhưng chrome.runtime bị invalid
function isExtensionValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function safeStorageSet(data) {
  if (!isExtensionValid()) return;
  try { chrome.storage.local.set(data); } catch (e) { /* context invalidated */ }
}

function safeStorageGet(keys, callback) {
  if (!isExtensionValid()) return;
  try { chrome.storage.local.get(keys, callback); } catch (e) { /* context invalidated */ }
}

// === CLEANUP: Tự dọn dẹp khi extension bị reload ===
function cleanup() {
  console.warn('[Coursera VI] Extension context invalidated — dọn dẹp');
  // Dừng observer
  try { observer.disconnect(); } catch(e) {}
  // Xóa overlay
  const el = document.getElementById('coursera-vi-subtitle-overlay');
  if (el) el.remove();
  overlayDiv = null;
  // Xóa toast & hint
  const toast = document.getElementById('coursera-vi-toast');
  if (toast) toast.remove();
  const hint = document.getElementById('coursera-vi-drag-hint');
  if (hint) hint.remove();
  // Gỡ timeupdate
  const video = findMainVideo();
  if (video) video.removeEventListener('timeupdate', onTimeUpdate);
}

// === 0. KHÔI PHỤC TỪ STORAGE (giải quyết F5) ===
safeStorageGet(
  ['subtitles', 'isEnabled', 'syncOffset', 'overlayPosition'],
  (data) => {
    if (data.subtitles && data.subtitles.length > 0) {
      subtitles = data.subtitles;
      isEnabled = data.isEnabled !== undefined ? data.isEnabled : true;
      syncOffset = data.syncOffset || 0;
      overlayPosition = data.overlayPosition || null;
      console.log(`[Coursera VI] Khôi phục ${subtitles.length} câu phụ đề từ storage`);
      initOverlay();
    }
  }
);

// === HELPER: TÌM VIDEO CHÍNH ===
function findMainVideo() {
  const courseraVideo = document.querySelector('.video-js video')
    || document.querySelector('[data-purpose="video-player"] video');
  if (courseraVideo) return courseraVideo;

  const videos = document.querySelectorAll('video');
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];
  return Array.from(videos).reduce((largest, v) =>
    (v.offsetWidth * v.offsetHeight) > (largest.offsetWidth * largest.offsetHeight) ? v : largest
  );
}

// === INIT OVERLAY (tạo + sync nếu có subtitles) ===
function initOverlay() {
  const video = findMainVideo();
  if (video) {
    if (!overlayDiv) createOverlay();
    if (subtitles.length > 0) startSync(video);
  }
}

// === 1. TẠO OVERLAY (fixed position, kéo thả) ===
function createOverlay() {
  if (overlayDiv) return; // Đã tạo rồi

  overlayDiv = document.createElement('div');
  overlayDiv.id = 'coursera-vi-subtitle-overlay';

  // Áp dụng vị trí đã lưu hoặc vị trí mặc định
  if (overlayPosition) {
    overlayDiv.style.left = overlayPosition.centerX + 'px';
    overlayDiv.style.top = overlayPosition.top + 'px';
    overlayDiv.style.bottom = 'auto';
    overlayDiv.style.transform = 'translateX(-50%)';
  }

  document.body.appendChild(overlayDiv);

  // Gắn drag handlers
  setupDrag(overlayDiv);

  console.log('[Coursera VI] Overlay đã được tạo (draggable)');
}

// === 1b. DRAG & DROP ===
function setupDrag(el) {
  let isDragging = false;
  let startMouseX, startMouseY, startCenterX, startTop;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    el.classList.add('dragging');

    const rect = el.getBoundingClientRect();
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    // Lưu tâm (center X) và top hiện tại
    startCenterX = rect.left + rect.width / 2;
    startTop = rect.top;

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  });

  function onDragMove(e) {
    if (!isDragging) return;
    // Tính tâm mới
    const newCenterX = startCenterX + (e.clientX - startMouseX);
    const newTop = startTop + (e.clientY - startMouseY);

    // left = tâm, translateX(-50%) sẽ căn giữa từ điểm này
    el.style.left = newCenterX + 'px';
    el.style.top = newTop + 'px';
    el.style.bottom = 'auto';
    el.style.transform = 'translateX(-50%)'; // LUÔN giữ căn giữa
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('dragging');

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    // Lưu vị trí tâm
    const rect = el.getBoundingClientRect();
    overlayPosition = {
      centerX: rect.left + rect.width / 2,
      top: rect.top
    };
    safeStorageSet({ overlayPosition });
  }
}

// === DRAG HINT ===
function showDragHint() {
  const hint = document.createElement('div');
  hint.id = 'coursera-vi-drag-hint';
  hint.textContent = '↕ Kéo phụ đề để di chuyển vị trí';

  // Đặt hint gần overlay
  if (overlayDiv) {
    const rect = overlayDiv.getBoundingClientRect();
    hint.style.left = rect.left + 'px';
    hint.style.top = (rect.top - 30) + 'px';
  } else {
    hint.style.bottom = '20%';
    hint.style.left = '50%';
    hint.style.transform = 'translateX(-50%)';
  }

  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 5000);
}

// === 2. SYNC PHỤ ĐỀ (timeupdate event) ===
function startSync(videoElement) {
  videoElement.removeEventListener('timeupdate', onTimeUpdate);
  videoElement.addEventListener('timeupdate', onTimeUpdate);
  console.log('[Coursera VI] Bắt đầu sync phụ đề');
}

function onTimeUpdate() {
  // Tự hủy nếu extension đã bị reload
  if (!isExtensionValid()) {
    cleanup();
    return;
  }

  const video = findMainVideo();
  if (!video || !isEnabled || subtitles.length === 0) {
    if (overlayDiv) overlayDiv.style.display = 'none';
    return;
  }

  const currentTime = video.currentTime + syncOffset;
  const activeCue = subtitles.find(
    cue => currentTime >= cue.start && currentTime <= cue.end
  );

  if (activeCue) {
    overlayDiv.style.display = 'block';
    overlayDiv.innerHTML = `<div class="cue-vi">${activeCue.translatedText}</div>`;
    // Hiện drag hint khi cue đầu tiên xuất hiện
    if (!dragHintShown) {
      dragHintShown = true;
      setTimeout(() => showDragHint(), 500);
    }
  } else {
    overlayDiv.style.display = 'none';
  }
}

// === 3. LẮNG NGHE MESSAGE TỪ POPUP ===
// Wrap trong try-catch để tránh lỗi khi extension bị reload
try {
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionValid()) return;

  switch (message.type) {
    case 'LOAD_SUBTITLES':
      subtitles = message.subtitles;
      syncOffset = message.syncOffset || 0;
      isEnabled = true;
      if (!overlayDiv) createOverlay();
      const video = findMainVideo();
      if (video) startSync(video);
      sendResponse({ success: true });
      break;

    case 'TOGGLE_ENABLED':
      isEnabled = message.enabled;
      if (!isEnabled && overlayDiv) overlayDiv.style.display = 'none';
      safeStorageSet({ isEnabled });
      sendResponse({ success: true });
      break;

    case 'SET_SYNC_OFFSET':
      syncOffset = message.offset;
      safeStorageSet({ syncOffset });
      sendResponse({ success: true });
      break;

    case 'RESET_POSITION':
      overlayPosition = null;
      if (isExtensionValid()) {
        try { chrome.storage.local.remove('overlayPosition'); } catch(e) {}
      }
      if (overlayDiv) {
        overlayDiv.style.left = '50%';
        overlayDiv.style.top = '';
        overlayDiv.style.bottom = '15%';
        overlayDiv.style.transform = 'translateX(-50%)';
      }
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse({
        isEnabled,
        hasSubtitles: subtitles.length > 0,
        subtitleCount: subtitles.length,
        syncOffset,
        hasVideo: !!findMainVideo()
      });
      break;
  }
  return true;
});
} catch(e) { console.warn('[Coursera VI] Message listener failed:', e.message); }

// === 4. THEO DÕI SPA NAVIGATION ===
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  // Tự hủy nếu extension đã bị reload
  if (!isExtensionValid()) {
    cleanup();
    return;
  }

  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('[Coursera VI] URL thay đổi');
    const oldVideo = findMainVideo();
    if (oldVideo) oldVideo.removeEventListener('timeupdate', onTimeUpdate);
    if (overlayDiv) overlayDiv.style.display = 'none';
    setTimeout(initOverlay, 1000);
  }

  // Phát hiện video mới
  if (subtitles.length > 0 && !overlayDiv) {
    initOverlay();
  } else if (subtitles.length > 0 && overlayDiv) {
    const video = findMainVideo();
    if (video) startSync(video);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// === 5. KEYBOARD SHORTCUTS ===
// Dùng phím KHÔNG xung đột với Coursera video player
document.addEventListener('keydown', (e) => {
  if (!isExtensionValid()) return;
  if (!e.ctrlKey || !e.shiftKey) return;

  switch (e.key) {
    case 'K': // Toggle overlay on/off
      isEnabled = !isEnabled;
      if (!isEnabled && overlayDiv) overlayDiv.style.display = 'none';
      safeStorageSet({ isEnabled });
      showToast(isEnabled ? '✅ Overlay BẬT' : '⏸ Overlay TẮT');
      e.preventDefault();
      e.stopPropagation();
      break;

    case 'R': // Reset vị trí overlay
      if (overlayDiv) {
        overlayPosition = null;
        if (isExtensionValid()) {
          try { chrome.storage.local.remove('overlayPosition'); } catch(e2) {}
        }
        overlayDiv.style.left = '50%';
        overlayDiv.style.top = '';
        overlayDiv.style.bottom = '15%';
        overlayDiv.style.transform = 'translateX(-50%)';
        showToast('↺ Reset vị trí overlay');
      }
      e.preventDefault();
      e.stopPropagation();
      break;
  }

  // Sync offset: dùng e.code vì Shift biến [ thành { và ] thành }
  if (e.code === 'BracketRight') {
    syncOffset += 0.5;
    safeStorageSet({ syncOffset });
    showToast(`Sync: ${syncOffset >= 0 ? '+' : ''}${syncOffset.toFixed(1)}s`);
    e.preventDefault();
    e.stopPropagation();
  }
  if (e.code === 'BracketLeft') {
    syncOffset -= 0.5;
    safeStorageSet({ syncOffset });
    showToast(`Sync: ${syncOffset >= 0 ? '+' : ''}${syncOffset.toFixed(1)}s`);
    e.preventDefault();
    e.stopPropagation();
  }
});

// === HELPER: TOAST ===
function showToast(text) {
  let toast = document.getElementById('coursera-vi-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'coursera-vi-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
}

console.log('[Coursera VI] Content script loaded (draggable overlay)');
