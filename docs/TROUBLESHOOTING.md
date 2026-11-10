# Xử lý lỗi thường gặp

- `node -v` thấp hơn 24.17: cài Node.js phiên bản tương thích discord.js, mở terminal mới.
- `Cannot find module`: đứng đúng thư mục có `package.json`, chạy `npm install`.
- `better-sqlite3` báo lỗi cài native module: dùng Node.js LTS được thư viện hỗ trợ, kiểm tra `npm install` và build tools. Tránh copy `node_modules` giữa các hệ điều hành.
- `Dictionary not found`: kiểm tra `DICTIONARY_DB_PATH` và chạy `py scripts/prepare_dictionary.py ...`.
- `no such column: pinyin_plain` hoặc `no such table: meanings_fts`: bạn đang trỏ nhầm vào DB gốc; phải trỏ vào bản đã qua prepare script.
- `Missing DISCORD_TOKEN`: kiểm tra `.env`; không dùng dấu ngoặc bao quanh token.
- `Used disallowed intents`: chỉ dùng `GatewayIntentBits.Guilds` như bản mẫu, không bật Message Content.
- Bot online nhưng `/tudien` không hiện: chạy `npm run register`, kiểm tra `DISCORD_CLIENT_ID`, `DISCORD_DEV_GUILD_ID`, bot đã được invite với `applications.commands`, chọn đúng server.
- `Unknown interaction`: phải phản hồi/defer ban đầu trong 3 giây; đã defer ở đầu handler /tudien.
- Discord `50013 Missing Permissions`: cấp quyền View Channel, Send Messages, Embed Links tại kênh test.
- FTS5 không có: bản Python SQLite cài đặt bất thường không hỗ trợ FTS5; kiểm tra `SELECT sqlite_compileoption_used('ENABLE_FTS5')`.
