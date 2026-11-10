# Phase 2 — Túi Càn Khôn

## Mục tiêu
- `/tudien`: thêm nút **Lưu <chữ Hán>** cho tối đa 5 mục từ trong một kết quả.
- `/tuikho [trang]`: xem tối đa 10 từ/trang và nút **Bỏ** để xóa từ.
- Mỗi người trong mỗi guild có túi riêng, không cộng XP khi chỉ lưu từ.

## Khởi động từ Phase 1 đang chạy
1. Sao lưu cả thư mục dự án (quan trọng nhất là `.env`, `data/cvdict-app.sqlite`).
2. Dừng bot bằng Ctrl+C.
3. Chép đè các file trong bản patch vào **thư mục gốc** của dự án; không xóa file cũ.
4. Thêm `PROGRESS_DB_PATH=./data/progress.sqlite` vào `.env` (không sửa thông tin token).
5. `npm test`
6. `npm run typecheck`
7. `npm run build`
8. `npm run register`
9. `npm run dev`
10. Discord: `/tudien tu:再见` → bấm **Lưu** → `/tuikho` → bấm **Bỏ**.

## Database
- `data/cvdict-app.sqlite`: từ điển CVDICT read-only, không ghi dữ liệu người dùng.
- `data/progress.sqlite`: lưu `saved_words`, tự khởi tạo khi bot chạy lần đầu.
- SQLite `WAL`, `busy_timeout=5000`, migration v1 dùng `PRAGMA user_version`.
- Không commit `data/progress.sqlite` hoặc `.env` lên GitHub.
- Trên cloud phải gắn persistent volume cho cả dictionary và progress DB hoặc đặt chúng trong mount được bảo vệ.

## Cấu trúc
- `modules/dictionary`: chỉ phụ trách tra cứu, thêm `getById`.
- `modules/bag/domain`: hợp đồng repository.
- `modules/bag/application`: lưu, xóa, xem, kiểm tra từ có trong từ điển.
- `modules/bag/infrastructure`: SQLite + migrations.
- `modules/bag/presentation`: lệnh `/tuikho`, nút lưu/xóa.
- `app`: khởi tạo module, đăng ký commands, xử lý interactions.

## Cần nhớ
- Đây là một túi từ riêng cho mỗi người **trong từng server**, chưa có nhiều bộ/deck được đặt tên.
- Ở Phase 2.1 có thể mở rộng `decks`, `deck_words` mà không đụng CVDICT.
- Không thay thế/reimport dictionary theo cách làm đổi `entries.id` khi đã có túi từ (cần mapping IDs nếu cập nhật dataset).
- Không tạo thêm bot thứ hai với cùng token đang chạy đồng thời.
