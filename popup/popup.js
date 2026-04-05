/**
 * Popup Logic — Coursera VI Subtitle
 * Phase 2: Dịch bằng Opus-MT/NLLB-200 qua Python server
 */

// === STATE ===
let currentState = 'idle';  // idle | fileLoaded | translating | ready | playing | error
let subtitleData = null;
let selectedSource = 'pre-translated';
let syncOffset = 0;
let serverOnline = false;

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  // Khôi phục settings và translation state
  chrome.storage.local.get(
    [
      'subtitles',
      'syncOffset',
      'fileName',
      'totalCues',
      'selectedSource',
      'currentJobId',
    ],
    (data) => {
      if (data.selectedSource) {
        selectedSource = data.selectedSource;
        const radio = document.querySelector(`input[name="source"][value="${selectedSource}"]`);
        if (radio && !radio.disabled) radio.checked = true;
        updateSourceUI();
      }

      if (data.subtitles && data.subtitles.length > 0) {
        subtitleData = {
          fileName: data.fileName || 'Đã lưu',
          cues: data.subtitles,
          totalCues: data.totalCues || data.subtitles.length,
        };
        syncOffset = data.syncOffset || 0;
        updateSyncDisplay();
        updateFileInfo();
        setState('ready');
      }

      // Khôi phục progress bar nếu đang dịch dở dang
      if (data.currentJobId && subtitleData) {
        setState('translating');
        startJobPolling(data.currentJobId);
      } else if (data.currentJobId && !subtitleData) {
        // Trạng thái zombie từ phiên trước, clear nó đi
        chrome.storage.local.remove(['currentJobId']);
        setState('idle');
      }
    }
  );

  // Hỏi content script trạng thái hiện tại
  try {
    const response = await sendToContentScript({ type: 'GET_STATUS' });
    console.log('[Popup] GET_STATUS response:', response);
    if (response && response.hasSubtitles && response.isEnabled) {
      setState('playing');
    }
    // Kiểm tra kết nối tab
    if (!response) {
      showConnectionWarning();
    }
  } catch (e) {
    showConnectionWarning();
  }

  // Check server nếu cần
  if (selectedSource !== 'pre-translated') {
    checkServer();
  }
});

// === SOURCE SELECTION ===
document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener('change', async (e) => {
    // Nếu đang dịch mà đổi nguồn -> Hủy bỏ dịch
    if (currentState === 'translating') {
      await cancelCurrentJob();
      hideProgress();
      if (subtitleData) setState('fileLoaded');
      else setState('idle');
    }

    selectedSource = e.target.value;
    chrome.storage.local.set({ selectedSource });
    updateSourceUI();
    
    if (selectedSource !== 'pre-translated') {
      checkServer();
    }
  });
});

function updateSourceUI() {
  const serverSection = document.getElementById('server-section');
  if (selectedSource === 'pre-translated') {
    serverSection.classList.add('hidden');
  } else {
    serverSection.classList.remove('hidden');
  }
  // Reset state nếu đã load file nhưng đổi source
  if (subtitleData && currentState === 'ready' && selectedSource !== 'pre-translated') {
    setState('fileLoaded');
  } else if (subtitleData && currentState === 'fileLoaded' && selectedSource === 'pre-translated') {
    setState('ready');
  }
}

// === SERVER CHECK ===
document.getElementById('btn-check-server').addEventListener('click', () => checkServer());

async function checkServer() {
  const dot = document.getElementById('server-dot');
  const text = document.getElementById('server-text');

  dot.className = 'dot checking';
  text.textContent = 'Server: Đang kiểm tra...';

  try {
    const resp = await fetch('http://localhost:8765/health', {
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json();

    serverOnline = true;
    dot.className = 'dot online';
    const engines = data.engines || [];
    const loadedEngines = engines.filter((e) => e.loaded).map((e) => e.name);
    text.textContent = `Server: 🟢 Online (${loadedEngines.join(', ') || 'no engines'})`;
  } catch (e) {
    serverOnline = false;
    dot.className = 'dot offline';
    text.textContent = 'Server: 🔴 Offline — chạy: python server.py';
  }
}

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
    rawContent: content,  // Giữ raw content cho server dịch
    cues: result.cues,
    totalCues: result.cues.length,
  };

  // Lưu vào storage (F5 persistence)
  chrome.storage.local.set({
    subtitles: result.cues,
    fileName: file.name,
    totalCues: result.cues.length,
  });

  updateFileInfo();

  // Nếu pre-translated → sẵn sàng ngay
  // Nếu MT engine → cần bấm dịch trước
  if (selectedSource === 'pre-translated') {
    setState('ready');
  } else {
    setState('fileLoaded');
  }
});

// === NÚT CHÍNH ===
document.getElementById('btn-main').addEventListener('click', async () => {
  switch (currentState) {
    case 'fileLoaded':
      // Bắt đầu dịch
      await translateFile();
      break;

    case 'ready':
      // Bật overlay → gửi data tới content script
      console.log('[Popup] Sending LOAD_SUBTITLES:', subtitleData.cues.length, 'cues');
      const loadResponse = await sendToContentScript({
        type: 'LOAD_SUBTITLES',
        subtitles: subtitleData.cues,
        syncOffset,
      });
      console.log('[Popup] LOAD_SUBTITLES response:', loadResponse);
      if (loadResponse && loadResponse.success) {
        setState('playing');
      } else {
        // Content script chưa sẵn sàng — nhắc user refresh trang
        setState('error');
        document.getElementById('status-text').textContent =
          '❌ Không kết nối được tab Coursera. Hãy F5 trang Coursera rồi thử lại.';
      }
      break;

    case 'playing':
      // Tắt overlay
      await sendToContentScript({ type: 'TOGGLE_ENABLED', enabled: false });
      setState('ready');
      break;

    case 'error':
      // Reset
      setState(subtitleData ? 'fileLoaded' : 'idle');
      break;
  }
});

// === DỊCH FILE BẰNG JOB QUEUE ===
const SERVER_URL = 'http://localhost:8765';
let jobPollInterval = null;

async function translateFile() {
  if (!subtitleData || !subtitleData.cues) {
    setState('error');
    document.getElementById('status-text').textContent = '❌ Không có nội dung file';
    return;
  }

  // Kiểm tra server
  if (!serverOnline) {
    await checkServer();
    if (!serverOnline) {
      setState('error');
      document.getElementById('status-text').textContent = '❌ Server offline — chạy: python server.py';
      return;
    }
  }

  setState('translating');
  showProgress(0);

  try {
    const resp = await fetch(`${SERVER_URL}/translate/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cues: subtitleData.cues,
        engine: selectedSource || 'opus-mt',
        use_glossary: true,
      }),
    });

    if (!resp.ok) throw new Error('Cannot start job');
    const data = await resp.json();
    
    if (data.success && data.job_id) {
      chrome.storage.local.set({ currentJobId: data.job_id });
      startJobPolling(data.job_id);
    }
  } catch (err) {
    setState('error');
    document.getElementById('status-text').textContent = `❌ Lỗi kết nối server: ${err.message}`;
    hideProgress();
  }
}

function startJobPolling(jobId) {
  if (jobPollInterval) clearInterval(jobPollInterval);
  
  jobPollInterval = setInterval(async () => {
    try {
      const resp = await fetch(`${SERVER_URL}/translate/job/${jobId}`);
      if (!resp.ok) {
        if (resp.status === 404) throw new Error('Server đã khởi động lại, tiến trình bị mất.');
        throw new Error('Lỗi server');
      }
      
      const job = await resp.json();
      
      if (job.status === 'translating') {
        showProgress(job.progress);
      } else if (job.status === 'completed') {
        clearInterval(jobPollInterval);
        showProgress(100);
        
        subtitleData.cues = job.result;
        subtitleData.totalCues = job.result.length;
        
        chrome.storage.local.set({
          subtitles: job.result,
          fileName: subtitleData.fileName,
          totalCues: subtitleData.totalCues
        });
        chrome.storage.local.remove('currentJobId');
        
        updateFileInfo();
        setState('ready');
      } else if (job.status === 'error' || job.status === 'cancelled') {
        clearInterval(jobPollInterval);
        chrome.storage.local.remove('currentJobId');
        setState('error');
        document.getElementById('status-text').textContent = 
          job.status === 'cancelled' ? '❌ Đã hủy' : `❌ Lỗi: ${job.error}`;
        hideProgress();
      }
    } catch (err) {
      clearInterval(jobPollInterval);
      chrome.storage.local.remove('currentJobId');
      setState('error');
      document.getElementById('status-text').textContent = `❌ Lỗi: ${err.message}`;
      hideProgress();
    }
  }, 1000);
}

async function cancelCurrentJob() {
  if (jobPollInterval) clearInterval(jobPollInterval);
  const data = await chrome.storage.local.get('currentJobId');
  if (data.currentJobId) {
    fetch(`${SERVER_URL}/translate/job/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: data.currentJobId })
    }).catch(() => {});
    chrome.storage.local.remove('currentJobId');
  }
}

// === NÚT XÓA ===
document.getElementById('btn-clear').addEventListener('click', async () => {
  // Hủy dịch nếu đang chạy ngầm
  if (currentState === 'translating') {
    await cancelCurrentJob();
  }

  subtitleData = null;
  syncOffset = 0;
  chrome.storage.local.remove(['subtitles', 'fileName', 'totalCues', 'syncOffset']);
  await sendToContentScript({ type: 'TOGGLE_ENABLED', enabled: false });
  hideWarnings();
  hideProgress();
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

// === PROGRESS ===
function showProgress(percent) {
  const section = document.getElementById('progress-section');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');

  section.classList.remove('hidden');
  fill.style.width = `${percent}%`;
  text.textContent = `${Math.round(percent)}%`;
}

function hideProgress() {
  document.getElementById('progress-section').classList.add('hidden');
}

// === UI HELPERS ===
function setState(newState) {
  currentState = newState;
  const btn = document.getElementById('btn-main');
  const statusBar = document.getElementById('status-bar');

  const config = {
    idle: {
      btn: '▶ BẬT OVERLAY',
      disabled: true,
      status: 'Chưa có file phụ đề',
      icon: '⚪',
    },
    fileLoaded: {
      btn: '🔄 DỊCH FILE',
      disabled: false,
      status: `${subtitleData?.fileName} — cần dịch`,
      icon: '📄',
    },
    translating: {
      btn: '⏳ Đang dịch...',
      disabled: true,
      status: `Đang dịch ${subtitleData?.totalCues || 0} câu...`,
      icon: '⏳',
    },
    ready: {
      btn: '▶ BẬT OVERLAY',
      disabled: false,
      status: `Sẵn sàng — ${subtitleData?.totalCues} câu`,
      icon: '✅',
    },
    playing: {
      btn: '⏸ TẮT OVERLAY',
      disabled: false,
      status: 'Đang phát',
      icon: '🔊',
    },
    error: {
      btn: '↩ Thử lại',
      disabled: false,
      status: 'Lỗi',
      icon: '❌',
    },
  };

  const c = config[newState];
  if (!c) return;
  btn.textContent = c.btn;
  btn.disabled = c.disabled;
  document.getElementById('status-text').textContent = c.status;
  document.getElementById('status-icon').textContent = c.icon;
  statusBar.className = `status ${newState}`;

  // Ẩn progress khi không dịch
  if (newState !== 'translating') {
    hideProgress();
  }
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
  el.innerHTML = warnings.map((w) => `<p class="warning-item">${w}</p>`).join('');
  el.classList.remove('hidden');
}

function hideWarnings() {
  document.getElementById('warnings').classList.add('hidden');
}

function showConnectionWarning() {
  const el = document.getElementById('warnings');
  el.innerHTML = '<p class="warning-item">⚠️ Không kết nối được tab Coursera. Hãy mở trang bài giảng Coursera và F5 (reload) nếu vừa cập nhật extension.</p>';
  el.classList.remove('hidden');
}

// === UTILS ===
async function sendToContentScript(payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'FORWARD_TO_TAB', payload }, (response) => {
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
