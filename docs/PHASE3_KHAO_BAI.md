# Phase 3 — Khảo bài chính tả

## Luồng sử dụng

1. Dùng `/khaobai batdau`, chọn bộ từ cá nhân, rồi chọn 5, 10 hoặc 20 câu (chỉ các số không vượt số từ đủ điều kiện mới được hiển thị).
2. Nghe audio đính kèm; chữ Hán và Pinyin được ẩn. Nút **Nghe lại**, **Đọc chậm**, **Gợi ý** và **Trả lời** thao tác trên câu hiện tại.
3. Nhập chữ Hán trong Discord Modal. Bot chấm xác định, chấp nhận giản thể hoặc phồn thể của mục từ, bỏ qua khoảng trắng/dấu câu, rồi hiện đáp án, Pinyin, nghĩa và số lần dùng gợi ý/nghe lại.
4. Chọn câu kế tiếp để tiếp tục; câu trả lời và thống kê được lưu trong `progress.sqlite`. Dùng `/khaobai tieptuc` để mở lại phiên sau khi bot restart hoặc giao diện cũ không còn.

### Chế độ viết giấy

Dùng `/khaobai vietgiay`, sau đó chọn bộ từ và số lượng câu. Bot đọc từng từ để người dùng tự viết ra giấy; giao diện không có gợi ý hay nút gửi đáp án, chỉ có:

- **Nghe lại**: phát lại từ hiện tại ở tốc độ thường.
- **Từ tiếp theo**: phát từ kế tiếp; ở từ cuối nút này hoàn thành phiên.
- **Đáp án đã đọc**: hiển thị riêng tư các đáp án theo đúng thứ tự từ câu đầu đến câu hiện tại. Các từ chưa chuyển tới không được hiển thị.

Chế độ được lưu trong `progress.sqlite`, vì vậy `/khaobai tieptuc` vẫn mở đúng giao diện viết giấy sau khi bot restart.

Mỗi người có tối đa một phiên hoạt động trong mỗi server. Phiên hết hạn sau 2 giờ không hoạt động. Chỉ chủ phiên trong đúng server mới thao tác được. Không có XP trong Phase 3.

## Chạy Piper TTS offline

Bot mặc định dùng Piper. Model cần được tải một lần; sau đó việc tổng hợp giọng nói chạy offline trên máy đang chạy Piper. Dự án Piper cung cấp model theo nhiều giọng/chất lượng; tên model cần dùng phải khớp giữa server và `PIPER_TTS_MODEL`. Ví dụ dưới đây dùng `zh_CN-huayan-medium`.

Mở một PowerShell riêng tại thư mục muốn lưu model:

```powershell
py -m pip install "piper-tts[http]"
py -m piper.download_voices zh_CN-huayan-medium
py -m piper.http_server --host 127.0.0.1 --port 5000 --model zh_CN-huayan-medium
```

Server lắng nghe ở `http://127.0.0.1:5000`. Piper HTTP API chính thức nhận `POST /synthesize` với JSON `{ "text": "...", "voice": "...", "length_scale": 1.0 }` và trả audio WAV. Provider gửi `length_scale: 1` khi đọc thường, `1.25` khi đọc chậm. Tài liệu upstream: [Piper HTTP API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md).

Trong `.env` của bot (tạo từ `.env.example` nếu cần), cấu hình:

```dotenv
DICTATION_TTS_PROVIDER=piper
PIPER_TTS_URL=http://127.0.0.1:5000
PIPER_TTS_MODEL=zh_CN-huayan-medium
PIPER_TTS_TIMEOUT_MS=30000
DICTATION_AUDIO_CACHE_DIR=./data/dictation-audio-cache
```

Chạy Piper trước, rồi tại thư mục dự án khởi chạy bot:

```powershell
npm run register
npm run dev
```

Bot đăng file `.wav` lên Discord. Cache WAV được phân biệt theo nội dung, model và tốc độ; có thể xóa thư mục cache để giải phóng dung lượng, khi cần audio sẽ được tạo lại. Lỗi kết nối, timeout, HTTP hoặc dữ liệu không phải WAV hợp lệ đều được báo rõ.

> **Lưu ý:** Piper offline sau khi model đã tải, nhưng giọng/model có thể có giấy phép riêng. Kiểm tra giấy phép của model trước khi phân phối hoặc dùng thương mại. Chạy bot và Piper trên cùng máy để giữ endpoint loopback riêng tư.

## Azure Speech (tùy chọn)

Azure vẫn được giữ như provider tùy chọn. Đặt `DICTATION_TTS_PROVIDER=azure` và cấu hình:

```dotenv
AZURE_SPEECH_KEY=your-speech-resource-key
AZURE_SPEECH_REGION=your-resource-region
```

Nếu thiếu credential hoặc TTS lỗi, bot báo lỗi và không bắt đầu phiên/câu hỏi mới. Không cần Azure key khi dùng Piper.

## Lưu trữ và khởi chạy

- Migration `progress.sqlite` v2 → v3 tạo `dictation_sessions` và `dictation_results`; v3 → v4 bổ sung chế độ khảo bài. CVDICT không bị sửa.
- Snapshot từng câu, đáp án, kết quả, gợi ý và số lần nghe lại được lưu bền vững.
- Slash command được thêm vào registry hiện có. Sau khi cập nhật bot, chạy `npm run register` để đăng ký lại lệnh server.
- Cần `progress.sqlite` Phase 2.1 (schema v2) hiện có; khi bot chạy, migration tự nâng lên v3.

## Kiểm thử thủ công trên Discord

1. Khởi chạy Piper HTTP server rồi chạy bot với `DICTATION_TTS_PROVIDER=piper`.
2. Dùng `/botu tao`, đưa ít nhất 5 từ có chữ giản thể và một cách đọc vào bộ.
3. Chạy `/khaobai batdau`; xác nhận audio WAV phát được và bot có các nút tương tác.
4. Thử nghe lại/chậm, gợi ý, trả lời đúng bằng giản thể, trả lời bằng phồn thể và trả lời sai; kiểm tra kết quả từng câu.
5. Tắt Piper rồi thử yêu cầu audio để kiểm tra lỗi service offline. Khởi động lại bot giữa phiên rồi dùng `/khaobai tieptuc`.
6. Kiểm tra submit modal cũ, nút cũ và tương tác từ tài khoản khác không thể cập nhật câu hiện tại.

`npm test`, `npm run typecheck`, `npm run build` chạy các kiểm tra tự động cục bộ.
