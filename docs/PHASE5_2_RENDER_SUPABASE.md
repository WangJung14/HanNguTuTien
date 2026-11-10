# Phase 5.2 — Render Free + Supabase Free

## Trạng thái hiện tại

- Supabase Session Pooler đã kết nối thành công.
- PostgreSQL schema v1 đã được tạo với RLS bật cho toàn bộ bảng bot.
- Dữ liệu `progress.sqlite` đã import và verify theo số bản ghi, tổng XP, profile XP và reward key.
- SQLite gốc không bị chỉnh sửa/xóa.
- Có scripts migrate, import, verify, backup và rollback.
- `/health` bind `0.0.0.0:$PORT`, không truy vấn DB và không trả secret.
- `render.yaml` khai báo đúng một Free Web Service.

> Chưa deploy Public Beta: repositories runtime vẫn đang dùng SQLite đồng bộ. Cần hoàn tất refactor async PostgreSQL trước khi bật `DATABASE_PROVIDER=postgres` trên Render.

## Commands dữ liệu

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

## Backup Free Plan

Chạy `db:pg:backup` định kỳ và sao chép file `.json.gz` ra ít nhất một nơi độc lập khỏi máy local và Supabase (ví dụ cloud drive riêng). Thư mục `backups/` bị gitignore. Free Plan không có automatic backup/PITR.

## Render

Các secret cần nhập trong Render Dashboard:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_DEV_GUILD_ID`
- `SUPABASE_DATABASE_URL` — Session Pooler port 5432

Không đưa `SUPABASE_MIGRATION_URL` lên Render. `PORT` do Render tự cấp.

External monitor gọi `GET https://<service>.onrender.com/health` mỗi 8 phút. Response chỉ gồm `status`, `discord`, uptime và timestamp. Ping không bảo đảm 24/7; Render vẫn có thể restart/suspend và giới hạn 750 giờ/tháng.

## TTS

CVDICT read-only được đóng gói tại `data/cvdict-app.sqlite`. Không dùng filesystem Render cho progress. Piper động chưa được chứng minh phù hợp 512 MB/0.1 CPU; không bật trong Public Beta cho đến khi có benchmark. Audio tĩnh cần được đóng gói hoặc provider phải trả lỗi rõ khi thiếu audio.
