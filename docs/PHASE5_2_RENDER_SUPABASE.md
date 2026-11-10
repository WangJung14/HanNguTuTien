# Phase 5.2 — Render Free + Supabase Free

## Trạng thái hiện tại

- Supabase Session Pooler đã kết nối thành công.
- PostgreSQL schema v1 đã được tạo với RLS bật cho toàn bộ bảng bot.
- Dữ liệu `progress.sqlite` đã import và verify theo số bản ghi, tổng XP, profile XP và reward key.
- SQLite gốc không bị chỉnh sửa/xóa.
- Có scripts migrate, import, verify, backup và rollback.
- `/health` bind `0.0.0.0:$PORT`, không truy vấn DB và không trả secret.
- `render.yaml` khai báo đúng một Free Web Service.

Runtime hiện đã có PostgreSQL adapters cho Bag, Deck, Dictation, Cultivation/XP, Quest, Meditation, Mountain và PvE; Dictionary tiếp tục đọc `data/cvdict-app.sqlite` ở chế độ chỉ đọc. `DATABASE_PROVIDER=postgres` được chọn trong `render.yaml`, không fallback sang SQLite nếu PostgreSQL lỗi.

**Chưa xác nhận deploy production từ môi trường này.** Bộ test, typecheck và build chạy cục bộ; chưa có kiểm thử tích hợp PostgreSQL trong phiên này. Trước khi bật bot, phải xác nhận kết nối và schema Supabase đúng bằng migration/verify scripts và cấu hình các biến môi trường trong Render.

## Commands dữ liệu

Các lệnh migration/import/verify/backup/rollback chạy thủ công từ máy quản trị và dùng `SUPABASE_MIGRATION_URL` trong môi trường local. Không dán connection URI vào chat hoặc commit vào repository.

```powershell
npm.cmd run db:pg:migrate
npm.cmd run db:pg:import
npm.cmd run db:pg:verify
npm.cmd run db:pg:backup
```

Import mặc định từ chối target đã có dữ liệu. Chỉ dùng `ALLOW_NONEMPTY_IMPORT=true` cho retry idempotent có chủ ý.

Khi cutover chính thức: dừng bot local, tạo backup Supabase, rồi import snapshot SQLite mới nhất bằng chế độ thay thế toàn bộ:

```powershell
$env:RESET_TARGET_BEFORE_IMPORT='true'
npm.cmd run db:pg:import
Remove-Item Env:RESET_TARGET_BEFORE_IMPORT
npm.cmd run db:pg:verify
```

Rollback là thao tác phá hủy và bị khóa:

```powershell
$env:CONFIRM_POSTGRES_ROLLBACK='DELETE_BOT_SCHEMA'
npm.cmd run db:pg:rollback
Remove-Item Env:CONFIRM_POSTGRES_ROLLBACK
```

Rollback chỉ xóa bảng bot trên Supabase; không xóa `progress.sqlite`.

Chạy migration và import từ máy quản trị đáng tin cậy, không cần đưa `SUPABASE_MIGRATION_URL` lên Render. Sau import, chạy verify; không chạy import thay thế sau khi bot đã bắt đầu ghi dữ liệu production nếu chưa có kế hoạch cutover rõ ràng.

## Backup Free Plan

Chạy `db:pg:backup` định kỳ và sao chép file `.json.gz` ra ít nhất một nơi độc lập khỏi máy local và Supabase (ví dụ cloud drive riêng). Thư mục `backups/` bị gitignore. Free Plan không có automatic backup/PITR.

## Render

Các secret cần nhập trong Render Dashboard:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_DEV_GUILD_ID`
- `SUPABASE_DATABASE_URL` — Supabase Session Pooler URI, port 5432
- `PIPER_TTS_URL` — base URL Piper HTTP Server có thể truy cập từ Render; provider tự thêm `/synthesize`. Không dùng `127.0.0.1` trừ khi Piper chạy cùng container.
- `PIPER_TTS_MODEL` — tên voice/model được server Piper cấu hình.

Không đưa `SUPABASE_MIGRATION_URL` lên Render. `PORT` do Render tự cấp.

Nếu thiếu `PIPER_TTS_URL` hoặc `PIPER_TTS_MODEL`, bot vẫn có thể chạy nhưng `/khaobai` không có audio và sẽ báo lỗi; cần cấu hình Piper trước khi dùng tính năng này.

External monitor gọi `GET https://<service>.onrender.com/health` mỗi 8 phút. Response chỉ gồm `status`, `discord`, uptime và timestamp. Ping không bảo đảm 24/7; Render vẫn có thể restart/suspend và giới hạn 750 giờ/tháng.

## TTS

CVDICT read-only và bộ câu hỏi `data/question-packs/hsk-sample.json` cần được đóng gói cùng source. Không dùng filesystem Render cho progress. Piper nên chạy như một HTTP service riêng; cấu hình URL phải truy cập được từ Render. Bảo vệ endpoint Piper khỏi truy cập lạm dụng. Piper chưa được benchmark trong deployment này; theo dõi độ trễ, bộ nhớ và giới hạn dịch vụ trước khi mở rộng sử dụng.

Blueprint hiện khai báo `han-ngu-tu-tien-piper` là Free Web Service dùng Dockerfile `piper/Dockerfile`; model `zh_CN-huayan-medium` được tải trong lúc build image. Service phải ở cùng region với bot. Sau khi sync Blueprint và deploy xong, đặt `PIPER_TTS_URL` ở bot thành URL HTTPS công khai của Piper, ví dụ `https://han-ngu-tu-tien-piper.onrender.com`, và `PIPER_TTS_MODEL=zh_CN-huayan-medium`.

Private Service không thuộc các loại service free. Free Web Service công khai là lựa chọn không mất phí, nhưng Piper HTTP Server mặc định không có xác thực: endpoint có thể được gọi bởi bất kỳ ai biết hoặc tìm thấy URL, không chỉ bạn. Free Web Service cũng ngủ sau một khoảng không có traffic; lần gọi đầu có thể cần chờ service khởi động, nên hãy mở `/info` trước rồi mới thử `/khaobai`. Xem [Render Free services](https://render.com/docs/free) và [Private Services](https://render.com/docs/private-services).
