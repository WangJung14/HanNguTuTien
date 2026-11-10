# Hán Ngữ Tu Tiên — Dictionary + Túi Càn Khôn + Bộ Từ Vựng + Khảo bài

Dự án TypeScript + discord.js + SQLite dành cho học tiếng Trung theo chủ đề tu tiên.

Đã hỗ trợ:
- `/ping`, `/help`
- `/tudien`: tra giản thể/phồn thể/Pinyin/nghĩa Việt từ CVDICT (read-only)
- `/tuikho`: lưu và xem từ cá nhân
- `/botu`: tạo và quản lý Decks, chia sẻ/sao chép trong cùng server, chuyển từ giữa bộ
- `/khaobai`: nghe audio và làm bài chính tả từ Deck cá nhân (Phase 3)

**Nâng cấp từ Phase 2:** xem `docs/PHASE2_1_BO_TU_VUNG.md` để sao lưu và chép patch an toàn.

## Chạy nhanh sau khi có `.env` và dữ liệu

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run register
npm run dev
```

Hai biến SQLite trong `.env`:

```dotenv
DICTIONARY_DB_PATH=./data/cvdict-app.sqlite
PROGRESS_DB_PATH=./data/progress.sqlite
```

- Bot sử dụng duy nhất `progress.sqlite` cho dữ liệu người chơi, tự động nâng schema lên version 3 khi startup.
- Module khảo bài lưu session/kết quả trong `progress.sqlite`; TTS mặc định dùng Piper chạy offline. Hướng dẫn cài Piper và cấu hình Azure tùy chọn: `docs/PHASE3_KHAO_BAI.md`.
- Không chứa token, `.env` hay database trong source/ZIP.
- Tham khảo thêm tài liệu Phase 1 và 2 trong `docs/`.
