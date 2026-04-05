# 🛠️ Development & Maintenance Guide — Coursera VI Subtitle

Tài liệu này cung cấp hướng dẫn kỹ thuật cho các lập trình viên muốn bảo trì, mở rộng hoặc kiểm thử hệ thống.

---

## 1. Cấu trúc thư mục (Directory Structure)

Dự án được tổ chức theo từng Module chức năng tách biệt:

### Lớp giao diện (Chrome Extension):
- `popup/`: Giao diện điều khiển (HTML, CSS, JS).
- `content/`: Logic hiển thị overlay và đồng bộ video.
- `lib/`: Các thư viện dùng chung (vd: `subtitle-parser.js`).
- `icons/`: Các icon đại diện cho Extension.
- `manifest.json`: File cấu hình quyền và tài nguyên của Extension.

### Lớp xử lý (Python Server):
- `server/server.py`: FastAPI routes và xử lý logic HTTP.
- `server/translator.py`: Lớp Wrapper cho HuggingFace Transformers.
- `server/glossary.py`: Hệ thống quản lý thuật ngữ lưu dưới dạng `.json`.
- `server/scripts/`: Các script viết bằng Python để gỡ lỗi trực tiếp qua Terminal.

### Lớp kiểm thử (Tests):
- `test/test-runner.html`: Trung tâm chạy toàn bộ các bài kiểm thử.
- `test/test-parser.html`: Kiểm tra độ bền (Robustness) của bộ Regex xử lý file VTT/SRT.
- `test/test-translation.html`: Giả lập trình duyệt gọi API để kiểm tra tính ổn định của Server.
- `test/test-page.html`: Trang mô phỏng Video Player (Sandbox) để test Kéo thả & Sync.

---

## 2. Quy trình kiểm thử (Testing Workflow)

Mỗi lần thay đổi code, hãy đảm bảo hệ thống vượt qua các trạm kiểm soát sau:

### Trạm 1: Browser-native Unit Test (Regex)
Mở file `test/test-parser.html` trực tiếp trên Chrome.
- **Mục tiêu:** Đảm bảo Parser không "chết" khi gặp file phụ đề bị lỗi dấu phẩy, thiếu múi giờ hay định dạng méo mó.
- **Pass criteria:** 33/33 tests đạt chuẩn.

### Trạm 2: API Integration Test
Bật Server Python (`python server.py`), sau đó mở `test/test-translation.html`.
- **Mục tiêu:** Kiểm tra xem Server có phản hồi đúng định dạng JSON không, Job Queue có đang bị treo không, và tính năng "Hủy (Cancel)" có nhạy không.

### Trạm 3: Visual & Sync Test
Mở `test/test-page.html` (Môi trường Sandbox không cần Internet).
- **Mục tiêu:** Kéo thử vị trí phụ đề, bấm Pause/Play/Seek video xem phụ đề có nhảy đúng câu không.

---

## 3. Các điểm lưu ý khi bảo trì (Maintenance Hooks)

### A. Sửa đổi Regex
Nếu Coursera thay đổi Header file `.vtt`, hãy chỉnh sửa Regex trong `lib/subtitle-parser.js`. Đây là bộ lọc "cánh cổng" đầu tiên của dữ liệu.

### B. Thay đổi AI Model
Để dùng model mạnh hơn (vd: NLLB-200), hãy đăng ký thêm trong hàm `init_engines()` của file `server/translator.py`. Toàn bộ hệ thống Job Queue sẽ tự động tương thích.

### C. Quản lý trạng thái (State)
Dữ liệu phụ đề được lưu trong `chrome.storage.local`. Nếu Extension chạy sai hành vi, hãy dùng nút **"Xóa (🗑️)"** trong Popup để Reset sạch sẽ storage trước khi nạp lại file mới.

---

## 4. Edge Cases đã xử lý (Resolved Gotchas)

1. **Context Invalidation:** Code đã có `try-catch` bọc quanh mọi lệnh gửi message để không làm trình duyệt văng lỗi khi Extension vừa reload.
2. **Video Selection:** Hàm `findMainVideo()` ưu tiên Video lớn nhất trên màn hình để tránh chọn nhầm các video phụ của Coursera.
3. **CPU Block:** Server dùng `asyncio.to_thread` khi gọi GPU/CPU mảng model lớn để không làm treo các request HTTP khác.
