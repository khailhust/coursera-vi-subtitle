/**
 * Popup Logic — Coursera VI Subtitle
 */

// === STATE ===
let currentState = 'idle';
let subtitleData = null;
let selectedSource = 'pre-translated';
let syncOffset = 0;

// === INIT: Khôi phục trạng thái ===
document.addEventListener('DOMContentLoaded', async () => {
  // Khôi phục settings
  chrome.storage.local.get(['subtitles', 'syncOffset', 'fileName', 'totalCues'], (data) => {
    if (data.subtitles && data.subtitles.length > 0) {
      subtitleData = {
        fileName: data.fileName || 'Đã lưu',
        cues: data.subtitles,
        totalCues: data.totalCues || data.subtitles.length
      };
      syncOffset = data.syncOffset || 0;
      updateSyncDisplay();
      updateFileInfo();
      setState('ready');
    }
  });

  // Hỏi content script trạng thái hiện tại
  try {
    const response = await sendToContentScript({ type: 'GET_STATUS' });
    if (response && response.hasSubtitles && response.isEnabled) {
      setState('playing');
    }
  } catch (e) { /* Content script chưa sẵn sàng */ }
});

// === FILE INPUT ===
document.getElementById('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const content = await readFileAsText(file);
  const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt';

  // Parser trả về { cues, warnings }
  const result = SubtitleParser.parse(content, format);

  // Hiển thị warnings
  if (result.warnings.length > 0) {
    showWarnings(result.warnings);
  } else {
    hideWarnings();
  }

  // Kiểm tra file rỗng
  if (result.cues.length === 0) {
    setState('error');
    document.getElementById('status-text').textContent = '❌ File không chứa phụ đề nào';
    return;
  }

  subtitleData = {
    fileName: file.name,
    format,
    cues: result.cues,
    totalCues: result.cues.length
  };

  // Lưu vào storage (F5 persistence)
  chrome.storage.local.set({
    subtitles: result.cues,
    fileName: file.name,
    totalCues: result.cues.length
  });

  updateFileInfo();
  setState('ready');
});

// === NÚT CHÍNH ===
document.getElementById('btn-main').addEventListener('click', async () => {
  switch (currentState) {
    case 'ready':
      // Bật overlay → gửi data tới content script
      await sendToContentScript({
        type: 'LOAD_SUBTITLES',
        subtitles: subtitleData.cues,
        syncOffset
      });
      setState('playing');
      break;

    case 'playing':
      // Tắt overlay
      await sendToContentScript({ type: 'TOGGLE_ENABLED', enabled: false });
      setState('ready');
      break;

    case 'error':
      setState('idle');
      break;
  }
});

// === NÚT XÓA ===
document.getElementById('btn-clear').addEventListener('click', async () => {
  subtitleData = null;
  syncOffset = 0;
  chrome.storage.local.remove(['subtitles', 'fileName', 'totalCues', 'syncOffset']);
  await sendToContentScript({ type: 'TOGGLE_ENABLED', enabled: false });
  hideWarnings();
  updateSyncDisplay();
  document.getElementById('file-info').classList.add('hidden');
  setState('idle');
});

// === SYNC OFFSET ===
document.getElementById('btn-sync-plus').addEventListener('click', () => {
  syncOffset += 0.5;
  updateSyncOffset();
});

document.getElementById('btn-sync-minus').addEventListener('click', () => {
  syncOffset -= 0.5;
  updateSyncOffset();
});

document.getElementById('btn-sync-reset').addEventListener('click', () => {
  syncOffset = 0;
  updateSyncOffset();
});

function updateSyncOffset() {
  updateSyncDisplay();
  chrome.storage.local.set({ syncOffset });
  sendToContentScript({ type: 'SET_SYNC_OFFSET', offset: syncOffset });
}

function updateSyncDisplay() {
  const sign = syncOffset >= 0 ? '+' : '';
  document.getElementById('sync-value').textContent = `${sign}${syncOffset.toFixed(1)}s`;
}

// === UI HELPERS ===
function setState(newState) {
  currentState = newState;
  const btn = document.getElementById('btn-main');
  const statusBar = document.getElementById('status-bar');

  const config = {
    idle:    { btn: '▶ BẬT OVERLAY', disabled: true,  status: '⚪ Chưa có file phụ đề',                     icon: '⚪' },
    ready:   { btn: '▶ BẬT OVERLAY', disabled: false, status: `✅ Sẵn sàng — ${subtitleData?.totalCues} câu`, icon: '✅' },
    playing: { btn: '⏸ TẮT OVERLAY', disabled: false, status: '🔊 Đang phát',                                icon: '🔊' },
    error:   { btn: '↩ Quay lại',    disabled: false, status: '❌ Lỗi',                                      icon: '❌' }
  };

  const c = config[newState];
  if (!c) return;
  btn.textContent = c.btn;
  btn.disabled = c.disabled;
  document.getElementById('status-text').textContent = c.status;
  document.getElementById('status-icon').textContent = c.icon;
  statusBar.className = `status ${newState}`;
}

function updateFileInfo() {
  const el = document.getElementById('file-info');
  if (!subtitleData) {
    el.classList.add('hidden');
    return;
  }
  el.innerHTML = `📄 <strong>${subtitleData.fileName}</strong> — ${subtitleData.totalCues} câu phụ đề`;
  el.classList.remove('hidden');
}

function showWarnings(warnings) {
  const el = document.getElementById('warnings');
  el.innerHTML = warnings.map(w => `<p class="warning-item">${w}</p>`).join('');
  el.classList.remove('hidden');
}

function hideWarnings() {
  document.getElementById('warnings').classList.add('hidden');
}

// === UTILS ===
async function sendToContentScript(payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'FORWARD_TO_TAB', payload }, (response) => {
        // Kiểm tra lỗi "Receiving end does not exist"
        if (chrome.runtime.lastError) {
          console.warn('[Coursera VI Popup]', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (e) {
      console.warn('[Coursera VI Popup] sendMessage failed:', e.message);
      resolve(null);
    }
  });
}

function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsText(file);
  });
}
