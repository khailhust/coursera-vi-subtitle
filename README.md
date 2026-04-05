# 🎓 Coursera Vietnamese Subtitle Tool

Một tiện ích mở rộng (Chrome Extension) tối ưu hóa trải nghiệm học tập trên Coursera bằng cách cung cấp màn hình **Overlay Phụ đề Tiếng Việt** thông minh, mượt mà và khả năng **Tự động dịch AI**.

## ✨ Các tính năng nổi bật (Đã hoàn thiện)

- **Overlay Phụ đề Thông minh:** Phụ đề hiển thị lớp phủ trực tiếp trên video của Coursera, không can thiệp làm hỏng trang web.
- **Tuỳ chọn Kéo Thả (Drag & Drop):** Tự do kéo phụ đề tới bất kỳ vị trí nào trên màn hình.
- **Tinh chỉnh Đồng bộ (Sync Offset):** Căn chỉnh Subtitle chạy nhanh/chậm khớp với video theo đơn vị mili-giây.
- **2 Chế độ Nguồn Phụ đề:**
  - `Nạp file có sẵn:` Tải lên các file `.vtt` hoặc `.srt` đã được dịch sẵn từ bên thứ 3 (ChatGPT, Gemini). Hoạt động hoàn toàn Offline.
  - `Dịch bằng AI Server (Opus-MT):` Tiện ích sẽ đóng gói file tiếng Anh gốc và gửi cho Máy chủ Python chạy nội bộ trong máy bạn để tự động dịch siêu việt mà không tốn phí API.
- **Test Hub Tích hợp:** Đi kèm 1 bộ HTML Testing chuyên dụng (Browser-native) mô phỏng rà soát lại độ ổn định của API và Regex.

---

## 🚀 Hướng Dẫn Cài Đặt

Công cụ bao gồm 2 phần độc lập: **Trình duyệt Chrome (Extension)** và **Máy chủ dịch thuật (Python Server)**. Bạn chỉ cần cài Python Server nếu muốn dùng tính năng AI tự động dịch.

### 1. Cài đặt Tiện ích mở rộng (Chrome Extension)

1. Mở Google Chrome, vào thanh địa chỉ gõ: `chrome://extensions/`
2. Kích hoạt chế độ **"Developer mode"** (Chế độ dành cho nhà phát triển) ở góc trên cùng bên phải.
3. Click vào nút **"Load unpacked"** (Tải tiện ích đã giải nén).
4. Duyệt tới và chọn thư mục chứa dự án này (chứa file `manifest.json`).
5. Gắn ghim (Pin) biểu tượng Coursera VI Subtitle lên thanh công cụ (Toolbar) để sử dụng.

### 2. Cài đặt Máy chủ Dịch thuật AI (Tùy chọn)

Để sử dụng tính năng "Dịch bằng Opus-MT", bạn cần chạy Server dịch thuật (Dựa trên FastAPI/HuggingFace).

1. Bạn cần cài sẵn Python 3.9+ trên máy.
2. Mở Terminal / PowerShell và trỏ thư mục làm việc (cd) vào thư mục `/server` của dự án.
3. Tạo và kích hoạt môi trường ảo:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```
4. Cài đặt thư viện cần thiết:
   ```bash
   pip install -r requirements.txt
   ```
5. Khởi động Máy chủ:
   ```bash
   python server.py
   ```
   *Lưu ý: Ở lần chạy đầu tiên, hệ thống sẽ mất chút thời gian tải Model `Helsinki-NLP/opus-mt-en-vi` (~300MB).* 
   *Khi thấy Terminal báo `Uvicorn running on http://127.0.0.1:8765`, server đã sẵn sàng.*

---

## 💡 Hướng Dẫn Sử Dụng

### Lấy file phụ đề gốc (Tiếng Anh) từ Coursera:
1. Mở video bài giảng bạn muốn học.
2. Bên dưới video, chuyển qua tab **"Transcript" (Bản chép lời)**.
3. Nhấp vào nút tuỳ chọn **(CC)** trên video player và chọn **"Download Subtitles"** để tải file `.vtt` chuẩn.

### Cách 1: Nạp file Tiếng Việt (Offline)
Dùng cho trường hợp bạn đã nhờ ChatGPT hay Google dịch file `.vtt` trước đó.
- Click icon Extension trên Chrome.
- Chọn **"📄 Nạp file đã dịch sẵn"**.
- Bấm nút **Chọn file** và load file `.vtt` tiếng Việt.
- Bấm **▶ BẬT OVERLAY**. (Bạn có thể bật thêm CC tiếng Anh của Coursera để vừa xem tiếng Anh vừa nhìn Overlay tiếng Việt song ngữ).

### Cách 2: Nhờ AI tự động dịch (Cần bật Server)
- Hãy chắc chắn Server Python của bạn đang chạy nền theo hướng dẫn ở trên.
- Click icon Extension trên Chrome.
- Chọn **"🤖 Dịch bằng Opus-MT"**.
- Bấm nút **Chọn file gốc** và load cái file tiếng Anh (`.vtt`) vừa tải từ Coursera.
- Kế tiếp bấm nút cam **"🔄 DỊCH FILE"**.
- Một thanh tiến trình sẽ hiện ra. Hãy thả lỏng từ 15-30 giây để CPU máy tính của bạn hoàn tất dịch hàng trăm câu văn.
- Khi hoàn tất, một nút xanh hiện lên. Bấm **▶ BẬT OVERLAY** và tận hưởng!

---

## ⌨️ Phím tắt nhanh (Shortcuts)

Khi đang mở trang Coursera Player, bạn có thể thiết lập nhanh mà không cần chạm chuột:
- `Ctrl` + `Shift` + `K`: Bật / Tắt Overlay (Đóng đậy phụ đề tức thì)
- `Ctrl` + `Shift` + `]`: Dịch sub chạy sớm hơn (+0.5s)
- `Ctrl` + `Shift` + `[`: Chỉnh sub chạy muộn hơn (-0.5s)

---

## 🔬 Dành cho Developer (Test Hub)

Dự án được trang bị một bộ mini-test-framework tự vận hành không cần Node.js. 
Bạn có thể mở tệp `test/test-runner.html` trực tiếp bằng Chrome:
- **Unit Tests (`test-parser.html`):** Rà soát độ bền vững của bộ Regex xử lý file `.VTT`/`.SRT`.
- **API Server Integration (`test-translation.html`):** Check các endpoint FastApi, trạng thái chạy ngầm (Job Queue) và huỷ tác vụ (Cancellation).
- **Overlay Simulation (`test-page.html`):** Môi trường Sandbox chơi video giả lập để kiểm tra cơ chế Kéo-Thả UI Overlay bằng một file .vtt thật mà không cần trỏ trực tiếp vào Coursera.

---

## 📚 Tài liệu kỹ thuật (Documentation)

Dành cho các nhà phát triển và cộng tác viên:

- [🏗️ Kiến trúc hệ thống (Architecture)](docs/ARCHITECTURE.md): Chi tiết về luồng dữ liệu, Job Queue và Tech Stack.
- [🛠️ Hướng dẫn phát triển (Development)](docs/DEVELOPMENT.md): Cấu trúc thư mục, quy trình Testing và các lưu ý bảo trì.
- [📜 Nhật ký phát triển (Legacy Plans)](./): Các file `implementation_plan.md` và `design_detail.md` ghi lại lịch sử thiết kế ban đầu.
