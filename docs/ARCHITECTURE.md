# Kiến trúc Dictionary Module

- `domain`: kiểu dữ liệu, repository interface, quy tắc Pinyin.
- `application`: điều phối tìm kiếm, validation và tự nhận diện đầu vào.
- `infrastructure`: query SQLite qua Drizzle, dùng raw prepared SQL chỉ cho FTS5.
- `presentation`: định nghĩa Discord slash command và xử lý Embed.
- `shared/database`: mapping bảng đã có, kết nối read-only.
- `modules/dictation`: luồng khảo bài; domain chấm đáp án/chọn từ, application điều phối Deck/Dictionary/audio, infrastructure lưu kết quả và các provider TTS độc lập (Piper WAV mặc định, Azure Speech MP3 tùy chọn), presentation đăng ký lệnh `/khaobai`.
- `modules/cultivation`: XP ledger idempotent, cấu hình cảnh giới, Thiên Kiếp 10 câu và đồng bộ Discord role. Module dùng public API chọn câu/chấm đáp án/audio của Dictation; dữ liệu ghi vào `progress.sqlite` schema v5.
- `modules/meditation`: theo dõi Voice State, session/tick Bế Quan và scheduler không truy lĩnh thời gian offline.
- `modules/quests`: tiến độ nhiệm vụ hằng ngày, entry ID chống farm và streak học tập; Phase 4.1 dùng `progress.sqlite` schema v6.
- `modules/mountain`: câu hỏi trắc nghiệm từ Deck/Dictionary, trận Solo/Multiplayer, server-clock scoring, scheduler và leaderboard; Phase 5 dùng `progress.sqlite` schema v7.
- `modules/pve`: question-pack HSK kiểm duyệt, Bí Cảnh Solo và Boss co-op, server-clock scheduler, damage/reward idempotent; Phase 5.1 dùng `progress.sqlite` schema v8.
- `scripts/prepare_dictionary.py`: tạo bản sao từ điển có cột `pinyin_plain` và `meanings_fts`.

**Quan trọng:** File `data/raw/cvdict.sqlite` là source-of-truth từ từ điển đã import; chương trình không chỉnh file đó. Bot chỉ đọc `data/cvdict-app.sqlite`. Khi bổ sung XP, người chơi, streak... dùng một `app.sqlite` RIÊNG (read/write), migration độc lập. Không chạy `drizzle-kit push` lên file CVDICT.

## Tìm kiếm

1. Hanzi chính xác; nếu không có thì tìm prefix (chỉ chữ Hán).
2. Pinyin không dấu / dấu / số thanh, chuẩn hóa vào `pinyin_plain`.
3. Nghĩa tiếng Việt dùng FTS5 `unicode61 remove_diacritics 2` (hỗ trợ tìm từ, không bảo đảm phù hợp cho mọi câu dài hoặc thứ tự kết quả).
4. Kết quả giới hạn 5 mục từ; tối đa 5 nghĩa ngắn mỗi mục.

## Hạn chế v1

- Chưa có HSK, phân trang tìm kiếm, autocomplete hoặc XP.
- Kết quả tiếng Việt từ FTS là match từ khóa, không phải semantic search; từ quá ngắn hoặc nhập sai chính tả có thể không ra.
- Truy vấn Pinyin auto có thể mơ hồ với tiếng Việt không dấu; dùng tùy chọn `kieu: Nghĩa tiếng Việt` nếu cần.
- CVDICT chứa mục từ nhiều cách đọc và nghĩa tự động dịch, không nên dùng nguyên trạng để chấm bài.
- Phase 3 dùng migration riêng cho session/kết quả; Phase 4 nâng `progress.sqlite` lên v5 để lưu XP, cảnh giới, Thiên Kiếp và ánh xạ role. Piper WAV hoặc Azure MP3 cache trong `data/dictation-audio-cache/`. Không thay đổi CVDICT.
- Dữ liệu có giấy phép CC BY-SA 4.0; cần ghi công và tuân thủ các điều kiện chia sẻ khi phân phối dữ liệu/tác phẩm phái sinh.
