# Phase 7.1 — Ngộ Đạo Tâm Pháp (SRS Flashcards)

Ngộ Đạo Tâm Pháp là hệ thống ôn từ vựng bằng Spaced Repetition. Dữ liệu chữ Hán, Pinyin và nghĩa vẫn lấy từ CVDICT read-only; SRS chỉ lưu lịch học theo `guild_id + user_id + entry_id`.

## Lệnh Discord

- `/tamphap on`: tiếp tục phiên đang mở hoặc chọn **Tất cả từ đã lưu** / một bộ từ cá nhân.
- `/tamphap homnay`: xem số thẻ đến hạn, số từ mới còn được thêm và hạn mức đã dùng.
- `/tamphap thongke`: xem New, Learning/Relearning, Review, lượt ôn và lapse.
- `/tamphap caidat tumoingay:<0–100>`: đổi giới hạn từ mới, mặc định 10. Thẻ đã đến hạn không bị giới hạn.

Thẻ ban đầu chỉ hiện chữ Hán. Sau khi nhấn **Hiển thị đáp án**, Pinyin và nghĩa mới xuất hiện cùng bốn nút:

- **Again**: đặt lại repetition, giảm ease, chuyển Learning/Relearning và đến hạn sau 10 phút.
- **Hard**: tăng interval khoảng 1,2 lần và giảm ease 0,15.
- **Good**: các mốc đầu 1 ngày, 6 ngày; sau đó nhân interval với ease.
- **Easy**: các mốc đầu 4 ngày, 10 ngày; sau đó nhân interval với ease và hệ số 1,3.

Ease luôn nằm trong khoảng 1,3–3,0. Interval được lưu theo ngày, timestamps ISO UTC; ngày hoạt động và hạn mức dùng `Asia/Ho_Chi_Minh`.

## Chọn thẻ và dữ liệu

1. Lấy tất cả entry ID duy nhất từ Túi Càn Khôn hoặc bộ đã chọn.
2. Đưa toàn bộ thẻ đến hạn vào phiên, không giới hạn cứng.
3. Bổ sung thẻ chưa có tiến độ theo hạn mức từ mới còn lại trong ngày.
4. Một entry xuất hiện trong nhiều Deck vẫn chỉ có một `srs_cards`.
5. Nếu `deck_words.custom_meaning` có giá trị, phiên từ Deck ưu tiên nghĩa này; nếu không dùng nghĩa CVDICT.
6. Xóa liên kết khỏi Deck không xóa `srs_cards` hay review logs.

Mỗi người chỉ có một phiên ACTIVE/PAUSED trong một server. Nút **Tạm dừng** lưu trạng thái database; `/tamphap on` mở đúng session và `current_index` sau restart.

## XP và Daily Streak

- Khi tổng số entry khác nhau được ôn trong ngày đạt 10: tối đa **+10 XP**.
- Reward key: `srs:<guild>:<user>:<YYYY-MM-DD>` nên chỉ thưởng một lần/ngày.
- Mọi XP đi qua Cultivation `XpService` và cap 200 XP/ngày.
- Không thưởng theo số lần bấm hoặc theo rating.
- Session hoàn thành ghi nhận một ngày học qua API streak riêng; không làm tăng nhiệm vụ chính tả.
- Không truy lĩnh hoạt động trước khi migration Phase 7.1 được triển khai.

## Database

PostgreSQL migration `006_phase7_1_srs.sql` tạo:

- `srs_cards`: repetition, ease, interval, due, state, reviews và lapses.
- `srs_review_logs`: log bất biến với `event_key` duy nhất.
- `srs_sessions`: queue snapshot, vị trí, trạng thái lật và thống kê.
- `srs_settings`: giới hạn từ mới/ngày.
- `deck_words.custom_meaning`: nghĩa tùy chỉnh nullable cho Deck.

SQLite local nâng schema v10 lên v11. Production readiness yêu cầu PostgreSQL schema version 6 để không rơi về filesystem tạm của Render.

## Kiểm thử local

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run register
npm.cmd run dev
```

Kịch bản Discord:

1. Chạy `/tamphap on`, chọn nguồn và xác nhận Pinyin/nghĩa đang ẩn.
2. Thử dùng interaction cũ hoặc đánh giá trước khi lật; hệ thống phải từ chối.
3. Lật thẻ, dùng lần lượt Again/Hard/Good/Easy và xem `/tamphap thongke`.
4. Tạm dừng giữa phiên, restart bot, gọi `/tamphap on`; đúng thẻ kế tiếp phải xuất hiện.
5. Ôn đủ 10 entry khác nhau trong cùng ngày; nhận tối đa 10 XP đúng một lần.
6. Chơi phiên khác trong ngày hoặc retry interaction; XP không tăng lần hai.
7. Đặt `tumoingay:1`; cùng ngày chỉ lấy một thẻ mới, ngày Việt Nam tiếp theo được lấy thêm. Thẻ đến hạn vẫn xuất hiện đầy đủ.
8. Xóa từ khỏi một Deck nhưng giữ trong Bag/Deck khác; lịch sử SRS vẫn còn.

## Supabase và Render

Không deploy source yêu cầu schema v6 trước khi migrate Supabase:

```powershell
npm.cmd run db:pg:backup
npm.cmd run db:pg:migrate
npm.cmd run db:pg:audit
npm.cmd run register
```

Sau đó commit/push và deploy lại Render. Không chạy `db:pg:import` nếu Supabase có dữ liệu production mới hơn SQLite local.

Phase 7.1 không triển khai vật phẩm, luyện đan hoặc Phase 7.2.
