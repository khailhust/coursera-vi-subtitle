---

## 1. Tổng quan hệ thống (System Overview)

Dự án là một hệ sinh thái kết hợp giữa trình duyệt (**Chrome Extension**) và Máy chủ dịch thuật địa phương (**Python Backend Server**). 

### Mục tiêu chính:
- Hiển thị phụ đề dịch tiếng Việt (Overlay) đồng bộ với Video trên nền tảng Coursera.
- Tự động dịch file phụ đề gốc (EN) sang tiếng Việt (VI) bằng AI (Opus-MT) mà không phụ thuộc vào Internet (Dịch nội bộ).

---

## 2. Các thành phần cốt lõi (Core Components)

Hệ thống được chia làm 4 lớp tương tác:

### A. Popup UI (`popup/`)
- Giao diện điều khiển chính cho người học.
- Quản lý trạng thái: Nạp file, Chọn ngôn ngữ, Tiến độ dịch.
- Thực hiện **Polling** trạng thái dịch từ Server mỗi giây.

### B. Background Service Worker (`background.js`)
- Đóng vai trò là "Cầu nối" (Bridge).
- Tự động Inject code vào trang Coursera khi cần.
- Quản lý vòng đời Extension.

### C. Content Script (`content/`)
- Mắt xích tương tác trực tiếp với trang Web Coursera.
- Theo dõi `video.currentTime` để hiển thị đúng câu phụ đề.
- Quản lý giao diện Overlay (Kéo thả, Sync Offset).

### D. Python NMT Server (`server/`)
- Trái tim dịch thuật (FastAPI).
- Chạy các mô hình Transformer (Helsinki-NLP) trên CPU/GPU.
- Quản lý **Job Queue** để xử lý các file dài mà không làm treo UI.

---

## 3. Luồng dữ liệu Dịch thuật (Job Queue Architecture)

Để đảm bảo hiệu năng và tránh "Timeout" trên trình duyệt, hệ thống sử dụng kiến trúc **Asynchronous Job Queue**:

```mermaid
sequenceDiagram
    participant P as Popup (JS)
    participant S as FastAPI Server (Python)
    participant M as NMT Model (Opus-MT)

    P->>S: POST /translate/job {cues, engine}
    S->>S: Sinh ID duy nhất & Đưa vào hàng chờ (Background Task)
    S-->>P: Trả về {job_id} ngay lập tức
    
    loop Theo dõi tiến độ (Polling)
        P->>S: GET /translate/job/{id}
        S-->>P: {status: 'translating', progress: 45%}
    end

    Note over S,M: Server chia nhỏ cues thành từng mẻ (batch 50)
    S->>M: Dịch từng mẻ
    M-->>S: Trả về kết quả
    
    P->>S: GET /translate/job/{id}
    S-->>P: {status: 'completed', result: [...]}
```

---

## 4. Các luồng xử lý chi tiết (Detailed Flows)

Dưới đây là các kịch bản tương tác giữa các thành phần Chrome Extension và dữ liệu:

### 4.1 Luồng nạp file Offline (Pre-translated)
Dùng khi người dùng đã có file phụ đề dịch sẵn.

```mermaid
sequenceDiagram
    participant U as User
    participant P as Popup
    participant L as SubtitleParser (Lib)
    participant C as Content Script (Overlay)

    U->>P: Chọn file .vtt / .srt
    P->>L: parse(content)
    L-->>P: {cues, warnings}
    P->>P: chrome.storage.local.set({subtitles})
    P->>C: sendMessage(LOAD_SUBTITLES)
    C-->>U: Hiển thị Overlay trên video
```

### 4.2 Luồng điều chỉnh đồng bộ (Sync Offset)
Dùng phím tắt hoặc UI để khớp phụ đề.

```mermaid
sequenceDiagram
    participant U as User
    participant C as Content Script
    participant V as Video Player (Coursera)
    participant S as chrome.storage

    U->>C: Bấm Ctrl+Shift+[ / ]
    C->>C: Cập nhật syncOffset (vd: +0.5s)
    C->>S: Lưu syncOffset mới
    loop Theo mỗi 100ms
        C->>V: Lấy video.currentTime
        C->>C: Tính: currentTime + syncOffset
        C-->>U: Cập nhật text hiển thị
    end
```

### 4.3 Luồng khôi phục trạng thái (Persistence/Reload)
Đảm bảo phụ đề không mất khi F5 trang.

```mermaid
sequenceDiagram
    participant T as Tab (Reload/F5)
    participant C as Content Script
    participant S as chrome.storage.local

    T->>C: Khởi tạo (Init)
    C->>S: Read {subtitles, isEnabled, offset}
    S-->>C: Trả về dữ liệu cũ
    C->>C: Phục hồi Overlay UI
    C-->>T: Tiếp tục hiển thị phụ đề
```

### 4.4 Luồng hủy tác vụ dịch (Job Cancellation)
Ngắt tiến trình dịch mẻ lớn trên server.

```mermaid
sequenceDiagram
    participant U as User
    participant P as Popup
    participant S as FastAPI Server
    participant B as Background Worker

    U->>P: Bấm nút "Hủy (Cancel)"
    P->>S: POST /translate/job/cancel {job_id}
    S->>S: Đánh dấu job_id["cancel"] = True
    S-->>P: {success: true}
    Note right of B: Vòng lặp Iterator kiểm tra cờ Cancel
    B->>B: Dừng xử lý mẻ tiếp theo
    B->>S: Status = "cancelled"
```

---

## 5. Công nghệ sử dụng (Tech Stack)

| Thành phần | Công nghệ | Lý do chọn |
|---|---|---|
| **Frontend** | Vanilla JS, HTML5, CSS3 | Tránh bloatware, tốc độ thực thi Content Script nhanh nhất |
| **Backend** | FastAPI (Python) | High performance, hỗ trợ Async/Background tasks cực tốt |
| **AI Model** | HuggingFace Transformers (MarianMT) | Model mã nguồn mở EN->VI chất lượng cao, chạy mượt trên CPU |
| **Storage** | `chrome.storage.local` | Lưu trữ file phụ đề, vị trí overlay... bền vững giữa các lần F5 |

---

## 5. Các cơ chế thông minh (Smart Mechanics)

- **SPA Detection:** Sử dụng `MutationObserver` để nhận diện khi người dùng chuyển bài học trên Coursera (Dynamic URL) mà không làm mất Overlay.
- **Context Guard:** Tự động phát hiện lỗi "Extension context invalidated" và hướng dẫn người dùng F5 an toàn.
- **Draggable Overlay:** Tính toán vị trí tương đối (Matrix) để duy trì vị trí phụ đề khớp với Responsive Video Player của Coursera.
