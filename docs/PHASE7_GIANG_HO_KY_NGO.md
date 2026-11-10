# Phase 7 — Giang Hồ Kỳ Ngộ

`/giangho` là hành trình cốt truyện solo kết hợp hội thoại và câu hỏi tiếng Trung. Tiến độ được lưu sau từng lựa chọn nên có thể tiếp tục sau khi bot restart.

## Nội dung MVP

Content Pack kiểm duyệt nằm tại `src/modules/adventure/content/adventure.vi.json`:

1. **Sơ Nhập Giang Hồ** — chào hỏi và giới thiệu bản thân.
2. **Thanh Vân Trấn** — mua bán, số đếm và hỏi giá.
3. **Thí Luyện Sơn Môn** — hội thoại cơ bản và khảo nghiệm tổng hợp.

Mỗi chương có đúng 5 cảnh. Nội dung không dùng AI và không tự suy luận cấp HSK từ CVDICT. Content loader kiểm tra phiên bản, số chương/cảnh, ID trùng, lựa chọn thiếu và câu không có đáp án đúng ngay khi bot khởi động.

## Lệnh và cách chơi

- `/giangho`: bắt đầu hoặc tiếp tục đúng checkpoint gần nhất.
- `/giangho chuong:1|2|3`: vào lại một chương đã mở khóa để ôn tập.

Cảnh hội thoại sử dụng Buttons; cảnh câu hỏi sử dụng Select Menu. Trả lời sai sẽ hiện giải thích và giữ nguyên cảnh. Trả lời đúng lưu checkpoint rồi chuyển cảnh tiếp theo. Chương sau chỉ mở khi chương trước đã hoàn thành.

Chơi lại không xóa lịch sử hoàn thành và không nhận XP lần nữa.

## Phần thưởng và an toàn dữ liệu

- Hoàn thành mỗi chương lần đầu: tối đa **20 XP**.
- XP đi qua Cultivation `XpService`, chịu giới hạn 200 XP/ngày.
- Reward key: `adventure:<guild>:<user>:chapter:<index>`.
- `adventure_answers.event_key` ngăn interaction retry/double-click.
- Hoàn thành chương và checkpoint nằm trong cùng transaction.
- Nếu bot dừng sau khi ghi hoàn thành nhưng trước lúc thưởng XP, lần `/giangho` tiếp theo tự reconcile phần thưởng. Ledger XP vẫn bảo đảm idempotency.

## Database

SQLite local nâng schema v9 lên v10. PostgreSQL/Supabase dùng migration:

```text
scripts/postgres/005_phase7_adventure.sql
```

Các bảng mới:

- `adventure_progress`: checkpoint hiện tại và optimistic version.
- `adventure_answers`: lịch sử lựa chọn/idempotency key.
- `adventure_chapter_completions`: chương đã hoàn thành và trạng thái thưởng XP.

Không chạy `db:pg:import` khi Supabase đã có dữ liệu production.

## Kiểm thử local

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run register
npm.cmd run dev
```

Kịch bản Discord:

1. Chạy `/giangho`, chọn một đáp án sai và xác nhận bot giải thích nhưng vẫn ở cảnh cũ.
2. Chọn đúng đủ 5 cảnh; kiểm tra chương 2 mở và nhận tối đa 20 XP.
3. Restart bot giữa chương, gọi lại `/giangho`; checkpoint phải giữ nguyên.
4. Hoàn thành cả ba chương theo thứ tự; chương khóa không được truy cập sớm.
5. Dùng `/giangho chuong:1` chơi lại; tổng XP không tăng thêm.
6. Bấm lại nút/select cũ; bot phải từ chối cảnh cũ hoặc nhận diện interaction đã xử lý.
7. Khi đã gần cap 200 XP/ngày, hoàn thành chương và kiểm tra XP thực nhận bị giới hạn đúng bởi Phase 4.

## Supabase và Render

Backup rồi áp dụng migration từ máy local:

```powershell
npm.cmd run db:pg:backup
npm.cmd run db:pg:migrate
npm.cmd run db:pg:audit
npm.cmd run register
```

Sau đó push source và deploy lại Render. Runtime PostgreSQL sẽ từ chối khởi động nếu Supabase chưa có schema version 5, nhằm tránh âm thầm lưu tiến độ vào filesystem tạm.

Phase 7 không thêm vật phẩm, shop, PvP hoặc nội dung Phase 7.1.
