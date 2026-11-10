# Phase 4.1 — Nhiệm Vụ Tu Luyện & Bế Quan

## Lệnh

- `/nhiemvu`: xem bốn nhiệm vụ, tiến độ và XP đã thưởng trong ngày.
- `/bequan`: xem số phút hợp lệ, XP nguồn Bế Quan, giới hạn còn lại và phiên đang chạy.
- `/diemdanh`: xem streak học chính tả; lệnh chỉ đọc dữ liệu, không tự cộng XP.
- `/bequancauhinh kenh voice_channel:<phòng>`: admin có Manage Server chọn Voice Channel.
- `/bequancauhinh tat`: tắt và kết thúc các phiên Bế Quan trong server.

## Bế Quan

Người thật ở liên tục trong phòng cấu hình đủ 5 phút nhận 5 XP. Ở một mình, mute hoặc deafen vẫn hợp lệ; bot account không được tính. Rời hoặc đổi phòng sẽ bỏ phần thời gian chưa đủ chu kỳ. Bot không cần tham gia Voice Channel.

XP từ `meditation_tick` và nhiệm vụ `Bế Quan Tĩnh Tâm` dùng chung trần 60 XP/ngày, vẫn chịu trần tổng 200 XP/ngày và không thể đưa tổng XP vượt 1.750. Thời gian hợp lệ vẫn được ghi nhận nếu XP thực nhận bị giới hạn.

Mỗi session và tick có reward key riêng. Scheduler kiểm tra mỗi 30 giây. Khi bot khởi động hoặc kết nối Discord được phục hồi, session cũ được đóng và chu kỳ mới bắt đầu từ Voice State hiện tại; không truy lĩnh thời gian offline.

## Nhiệm vụ hằng ngày

| Nhiệm vụ | Điều kiện | Thưởng |
|---|---:|---:|
| Thu Thập Bí Kíp | 5 entry ID mới trong ngày | 10 XP |
| Rèn Luyện Thần Thức | 10 câu chính tả đúng | 20 XP |
| Sư Phụ Chỉ Điểm | 1 phiên chính tả từ 10 câu | 15 XP |
| Bế Quan Tĩnh Tâm | 15 phút Bế Quan hợp lệ | 10 XP |

Nhiệm vụ tự nhận thưởng khi đủ điều kiện. Xóa rồi lưu lại cùng entry ID không tăng tiến độ. Dữ liệu phân ngày theo `Asia/Ho_Chi_Minh`; cấu hình nằm tại `modules/quests/domain/quest.config.ts`.

## Daily Streak

Streak tăng khi hoàn thành ít nhất một phiên chính tả trong ngày. Nhiều phiên cùng ngày chỉ tính một ngày; bỏ một ngày sẽ reset streak ở lần học tiếp theo. Bế Quan không tác động streak.

## Database

Migration `progress.sqlite` v5 → v6 thêm cấu hình/session/reward Bế Quan, tiến độ nhiệm vụ, entry ID theo ngày, streak và lịch sử ngày học. Không sửa CVDICT hoặc dữ liệu Phase 4.

## Kiểm thử Discord

1. Chạy `npm.cmd run register`, build và restart bot.
2. Cấp intent Voice States cho bot, sau đó dùng `/bequancauhinh kenh`.
3. Vào phòng, chạy `/bequan`, chờ qua mốc 5 phút rồi kiểm tra lại XP.
4. Rời phòng trước mốc kế tiếp để xác nhận phần phút lẻ không được thưởng.
5. Lưu từ, làm khảo bài và dùng `/nhiemvu`, `/diemdanh` để kiểm tra tiến độ.
6. Thử `/bequancauhinh tat` và xác nhận phiên hiện tại dừng ngay.

