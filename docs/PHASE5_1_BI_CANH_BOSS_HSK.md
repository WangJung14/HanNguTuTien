# Phase 5.1 — Thí Luyện Bí Cảnh & Boss HSK

## Bí Cảnh Solo

- `/bicanh vao capdo:<HSK1|HSK2|HSK3>`: 3 ải × 5 câu, mỗi câu 15 giây.
- `/bicanh lichsu`: lịch sử cá nhân.
- Dạng câu: Hán → Việt, Việt → Hán và chọn Pinyin.
- Đúng ít nhất 12/15 để thông quan, nhận 20 XP.
- Chỉ một lượt Bí Cảnh được thưởng mỗi ngày/người, không phân biệt cấp độ.
- Sau ải 1 và 2, người chơi xem kết quả rồi chủ động tiến vào ải tiếp theo. Cuối lượt hiển thị điểm và câu/từ cần ôn.

## Boss HSK Co-op

- Sự kiện mở Thứ Bảy 19:00 đến hết Chủ nhật, theo `Asia/Ho_Chi_Minh`.
- Mỗi server chỉ được mở một Boss trong mỗi tuần sự kiện, kể cả trận đã hủy/thất bại.
- `/boss mo capdo:<...>` và `/boss huy` yêu cầu quyền Manage Server.
- `/boss thamgia`, `/boss batdau`, `/boss xem`, `/boss bangxep`.
- 2–20 người; Boss HP = số người × 60.
- 10 câu chung, mỗi câu 12 giây. Mỗi đáp án đúng gây 10 sát thương.
- Đội thắng nếu Boss còn 0 HP sau 10 vòng.
- Người chơi chỉ nhận 30 XP khi đội thắng, trả lời đúng ít nhất 5 câu **và đã gửi đáp án đủ cả 10 vòng**. Điều kiện `answered_count = 10` loại người AFK/bỏ trận.
- Reward key theo `server + tuần + user`; một người chỉ nhận một lần/tuần.

## Question Pack

Pack mặc định: `data/question-packs/hsk-sample.json`, có 15 câu đã gắn nhãn cho từng HSK1–3. Có thể đặt `PVE_QUESTION_PACK_PATH` để import JSON khác.

Mỗi object cần: `id`, `level`, `type`, `prompt`, bốn `options`, `correctIndex`, `explanation`, `hanzi`, `pinyin`, `meaning`. Bot validate khi khởi động và từ chối:

- ID hoặc câu hỏi trùng;
- thiếu nội dung;
- không đúng bốn đáp án;
- đáp án trùng sau chuẩn hóa;
- level/type/correctIndex sai.

HSK chỉ lấy từ nhãn trong pack kiểm duyệt, không suy luận từ CVDICT.

## An toàn và dữ liệu

Server clock quyết định deadline. Answer được khóa bởi `(run, round, user)`. XP luôn đi qua `XpService` và chịu trần 200 XP/ngày. Phiên ACTIVE bị hủy khi restart, mất Discord shard hoặc cập nhật message thất bại; không thưởng XP.

Migration `progress.sqlite` v7 → v8 thêm `pve_runs`, `pve_players`, `pve_rounds`, `pve_answers`. Module cũ và CVDICT không bị thay đổi.

## Kiểm thử Discord

1. Chạy `npm.cmd run register`, build và restart bot.
2. Dùng `/bicanh vao capdo:HSK1`; thử đúng, sai, timeout và double-click.
3. Kiểm tra màn hình chuyển ải, kết quả cuối và `/bicanh lichsu`.
4. Trong cửa sổ cuối tuần, admin chạy `/boss mo`; dùng ít nhất hai tài khoản tham gia.
5. Chủ phòng/admin chạy `/boss batdau`; thử trả lời độc lập và theo dõi HP message chung.
6. Kiểm tra điều kiện đúng ≥5 nhưng thiếu một answer sẽ không nhận XP.
7. Restart bot giữa trận hoặc xóa quyền gửi message để xác nhận trận bị hủy, không thưởng.

