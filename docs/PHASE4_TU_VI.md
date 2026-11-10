# Phase 4 — Tu Vi & Cảnh Giới

## Lệnh người chơi

- `/tuvi`: xem tổng XP, cảnh giới thực tế, tiểu cảnh giới, thanh tiến độ và điều kiện tiếp theo.
- `/dotpha botu:<id>`: bắt đầu hoặc mở lại Thiên Kiếp 10 câu từ bộ cá nhân. Bộ phải có ít nhất 10 từ đủ điều kiện. Đạt 8/10 để sang đại cảnh giới kế tiếp.
- `/lichsutuvi`: xem XP ledger và những lần Thiên Kiếp gần đây.

Thất bại Thiên Kiếp không trừ XP và áp dụng cooldown mặc định 6 giờ. Một người chỉ có một lần Thiên Kiếp đang hoạt động trong mỗi server.

## Quy tắc XP mặc định

| Hoạt động | XP |
|---|---:|
| Chính tả đúng, không nghe lại/gợi ý | 10 |
| Đúng sau khi nghe lại | 7 |
| Đúng sau khi dùng gợi ý | 4 |
| Hoàn thành 5 câu | 10 |
| Hoàn thành 10 câu | 20 |
| Hoàn thành 20 câu | 40 |
| 10/10, không nghe lại/gợi ý | 30 |

Giới hạn mặc định là 200 XP/ngày theo múi giờ Việt Nam. Mỗi thưởng có `reward_key` duy nhất trong `xp_ledger`; một interaction retry hoặc bot restart không thể cộng lại. Claim bị giới hạn về 0 XP cũng được ghi ledger để không thể farm lại vào ngày sau.

Chế độ `/khaobai vietgiay` không được cộng XP vì không có đáp án thực tế để chấm.

## Cảnh giới

Cấu hình độc lập nằm trong `cultivation/domain/cultivation.config.ts`. Luyện Khí có 9 tầng tại 100, 250, 400, 600, 800, 1.000, 1.250, 1.500 và 1.750 XP. Trúc Cơ sơ/trung/hậu lần lượt tại 2.000, 3.000 và 4.000 XP. Các đại cảnh giới còn lại dùng đúng mốc Phase 4.

Tổng XP không giảm khi đột phá. Khi đủ mốc đại cảnh giới, hồ sơ vẫn giữ đại cảnh giới cũ ở trạng thái **viên mãn** cho đến khi vượt Thiên Kiếp. Vì `major_index` được lưu riêng, người chơi không thể tự động bỏ qua đại cảnh giới.

## Role cảnh giới

Admin có quyền **Manage Roles** dùng:

- `/canhgioirole gan canhgioi:<...> role:<...>`
- `/canhgioirole go canhgioi:<...>`
- `/canhgioirole dongbo thanhvien:<...>`

Bot kiểm tra quyền Manage Roles và hierarchy. Chỉ các role nằm trong bảng ánh xạ được gỡ khi đồng bộ; role khác của thành viên không bị tác động. Nếu Discord API lỗi, cảnh giới vẫn được giữ và hồ sơ có `role_sync_pending = 1` để admin retry.

## Database và vận hành

Migration `progress.sqlite` v4 → v5 tạo `cultivation_profiles`, `xp_ledger`, `breakthrough_attempts` và `guild_realm_roles`. CVDICT không bị thay đổi.

Sau khi cập nhật source:

```powershell
npm.cmd run register
npm.cmd run build
npm.cmd start
```

Đặt role của bot cao hơn toàn bộ role cảnh giới muốn quản lý.
