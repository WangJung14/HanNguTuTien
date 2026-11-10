# Phase 5 — Vấn Đỉnh Hán Ngữ

## Lệnh

- `/leonui solo botu:<id>`: chơi riêng tư 10 câu.
- `/leonui tao botu:<id>`: tạo phòng Multiplayer trong channel hiện tại.
- `/leonui thamgia`: tham gia phòng đang chờ; cũng có thể bấm **Tham Gia** trên lobby.
- `/leonui batdau`: chủ phòng bắt đầu khi có ít nhất 2 người.
- `/leonui huy`: chủ phòng hoặc admin có Manage Server hủy trận.
- `/leonui bangxep`: bảng xếp hạng tích lũy của server.
- `/leonui lichsu`: 10 trận gần đây của người dùng.

Multiplayer tối đa 20 người. Một người chỉ ở trong một trận WAITING/ACTIVE trong mỗi server; mỗi channel chỉ có một phòng Multiplayer đang hoạt động.

## Câu hỏi và tính điểm

Mỗi trận snapshot 10 câu, xen kẽ Hán → Việt và Việt → Hán, mỗi câu có bốn lựa chọn và deadline 10 giây. Đồng hồ bắt đầu sau khi Discord gửi/cập nhật message thành công. Answer chỉ dùng thời điểm server nhận interaction và khóa bằng `(match, round, user)`.

| Thời gian | Điểm đúng |
|---|---:|
| 0–1 giây | 100 |
| >1–2 giây | 90 |
| >2–3 giây | 80 |
| >3–4 giây | 70 |
| >4–5 giây | 60 |
| >5–6 giây | 50 |
| >6–7 giây | 40 |
| >7–8 giây | 30 |
| >8–10 giây | 20 |

Sai, timeout hoặc interaction đến sau deadline được 0 điểm. Xếp hạng ưu tiên tổng điểm, số câu đúng rồi tổng thời gian trả lời hợp lệ.

Nguồn câu dùng public API của Deck/Dictionary. Hệ thống chỉ nhận entry có đúng một nghĩa rõ ràng, một cách đọc không mơ hồ, Hán tự và nghĩa chuẩn hóa không trùng trong pool. Bộ phải có ít nhất 10 entry hợp lệ. Bộ công khai được phép sử dụng. Không dùng AI hoặc TTS.

Giới hạn hiện tại: hệ thống loại được nghĩa trùng sau chuẩn hóa, nhưng không thể tự xác định hai cụm từ khác chữ có đồng nghĩa hoàn toàn về mặt ngữ nghĩa; quản trị bộ từ nên kiểm tra nội dung trước khi công khai.

## XP

Người chơi hoàn thành đủ 10 vòng và đạt ít nhất 6/10 nhận 10 XP. Mỗi người chỉ nhận thưởng từ tối đa hai trận trong một ngày Việt Nam. Reward key là `match + user`, toàn bộ XP đi qua `XpService` và vẫn chịu giới hạn 200 XP/ngày. Trận bị hủy/expired không thưởng.

`mountain_score` chỉ nằm trong bảng Leo Núi, không cộng vào cultivation XP.

## Scheduler và restart

Multiplayer dùng scheduler cập nhật một message chung khi hết vòng. Solo dùng timer gắn với ephemeral interaction. ACTIVE match bị hủy khi bot restart hoặc Discord shard mất kết nối vì không thể phục hồi server clock an toàn; không thưởng XP. Lobby WAITING hết hạn sau 30 phút.

Migration `progress.sqlite` v6 → v7 tạo `mountain_matches`, `mountain_players`, `mountain_rounds` và `mountain_answers`. Không sửa CVDICT hoặc migration cũ.

## Kiểm thử Discord

1. Chạy `npm.cmd run register`, build và restart bot.
2. Chuẩn bị bộ cá nhân/công khai có ít nhất 10 từ, mỗi từ chỉ có một nghĩa/cách đọc rõ ràng.
3. Chạy `/leonui solo`, thử trả lời nhanh, chậm, sai và timeout.
4. Trong một channel, chạy `/leonui tao`; dùng ít nhất hai tài khoản tham gia rồi chủ phòng chạy `/leonui batdau`.
5. Double-click cùng đáp án và thử bấm nút vòng cũ để xác nhận bị từ chối.
6. Kiểm tra `/leonui bangxep`, `/leonui lichsu` và `/lichsutuvi`.
7. Restart bot giữa trận để xác nhận trận bị hủy và không có XP.

