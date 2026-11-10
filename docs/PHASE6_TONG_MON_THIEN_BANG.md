# Phase 6 — Khai Sơn Lập Phái & Thiên Bảng Tu Vi

Phase 6 bổ sung Tông Môn, Cống Hiến Tông Môn (CP), nhiệm vụ tuần và Thiên Bảng Tu Vi. CP hoàn toàn độc lập với XP cá nhân; đổi hoặc rời Tông Môn không chuyển CP cũ sang nơi mới.

## 1. Chuẩn bị local

Không dùng file trong `dist/` để chỉnh sửa. Source thật nằm trong `src/`; `npm run build` sẽ tạo lại `dist/`.

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Để test bằng SQLite local, đặt trong `.env`:

```dotenv
DATABASE_PROVIDER=sqlite
```

Đăng ký slash commands và chạy bot:

```powershell
npm.cmd run register
npm.cmd run dev
```

SQLite tự nâng `progress.sqlite` từ schema v8 lên v9. Không xóa database cũ.

## 2. Lệnh Tông Môn

- `/tongmon tao ten:<tên> mota:<mô tả>`: lập Tông Môn. Cần ít nhất 100 XP (Luyện Khí tầng 1), tên dài 2–40 ký tự và không trùng trong server.
- `/tongmon danhsach`: xem Tông Môn đang hoạt động và ID.
- `/tongmon xem`: xem Tông Môn, vai trò và số thành viên.
- `/tongmon xin id:<id>`: gửi đơn xin gia nhập.
- `/tongmon don`: Tông Chủ/Phó Tông Chủ xem đơn chờ.
- `/tongmon duyet id:<id> chapnhan:<true|false>`: xử lý đơn.
- `/tongmon moi thanhvien:<user>`: Tông Chủ/Phó Tông Chủ mời trực tiếp.
- `/tongmon roi`: rời Tông Môn. Tông Chủ phải chuyển giao hoặc giải tán trước.
- `/tongmon chucvu thanhvien:<user> vai_tro:<...>`: Tông Chủ bổ nhiệm Phó Tông Chủ hoặc giáng xuống Đệ Tử.
- `/tongmon chuyengiao thanhvien:<user>`: chuyển chức Tông Chủ.
- `/tongmon trucxuat thanhvien:<user>`: trục xuất theo phân quyền.
- `/tongmon giaitan`: giải tán; lịch sử ledger CP vẫn được bảo toàn.
- `/tongmon nhiemvu`: tiến độ nhiệm vụ tuần.
- `/tongmon donggop`: CP thành viên trong tuần.
- `/tongmon bangxep toanbo:<false>`: xếp hạng tuần; chọn `true` để xem toàn thời gian.

Vai trò gồm `MASTER` (Tông Chủ), `DEPUTY` (Phó Tông Chủ), `DISCIPLE` (Đệ Tử). Mỗi người chỉ thuộc tối đa một Tông Môn trong cùng server. Sức chứa mặc định là 50.

## 3. CP và nhiệm vụ tuần

CP được ghi bằng ledger và `reward_key` duy nhất, có transaction và giới hạn 100 CP/người/ngày:

| Hoạt động hợp lệ | CP |
|---|---:|
| Hoàn thành phiên chính tả ít nhất 10 câu | 10 |
| Vượt Thiên Kiếp | 30 |
| Hoàn thành Vấn Đỉnh | 10 |
| Thông quan Bí Cảnh | 20 |
| Thắng Boss và đủ điều kiện cá nhân | 30 |

Bế Quan không sinh CP. Reward được claim kể cả khi lúc đó người chơi chưa vào Tông Môn, vì vậy không thể làm hoạt động trước, gia nhập sau rồi retry để farm.

Nhiệm vụ reset theo tuần bắt đầu từ thứ Hai, múi giờ `Asia/Ho_Chi_Minh`:

- 100 câu chính tả đúng.
- 20 phiên chính tả hợp lệ từ 10 câu.
- 5 thành viên khác nhau có hoạt động hợp lệ.

Mỗi nhiệm vụ hoàn thành cộng 100 Uy Danh đúng một lần. Xếp hạng ưu tiên CP, sau đó Uy Danh, thời điểm thành lập và ID để thứ tự luôn ổn định.

## 4. Thiên Bảng Tu Vi

- `/bangxeptuvi`: xem riêng bảng hiện tại.
- `/bangxeptuvi hanhdong:cauhinh kenh:<text-channel>`: admin có quyền **Manage Server** cấu hình message công khai.
- `/bangxeptuvi hanhdong:capnhat`: cập nhật ngay.
- `/bangxeptuvi hanhdong:tat`: ngừng cập nhật tự động.

Bot chỉ duy trì một message cho mỗi server, sửa message cũ thay vì gửi bản mới, thử pin nếu có quyền và tự tạo lại nếu message đã bị xóa. Scheduler kiểm tra mỗi phút nhưng chỉ refresh bảng bình thường sau tối đa 10 phút hoặc khi XP/cảnh giới thay đổi. Bot bị loại khỏi bảng. Hòa XP ưu tiên hồ sơ đạt mốc sớm hơn rồi đến user ID.

Thiên Bảng hiển thị **cảnh giới thực tế** theo `major_index`. Người đã đủ XP nhưng chưa vượt Thiên Kiếp vẫn hiện cảnh giới cũ kèm `viên mãn`.

## 5. Phiếu bài tập

- Chính tả Discord: hiển thị tối đa 10 câu mỗi đợt; phiên 20 câu mở câu 11–20 sau khi nộp đợt đầu. Vì Discord giới hạn modal ở 5 ô, mỗi đợt 10 câu được nộp qua hai phiếu 5 câu. Chỉ công bố kết quả sau khi hoàn thành phiên.
- Thiên Kiếp: phát đủ 10 audio trên một giao diện, nộp hai phiếu 5 câu và chỉ công bố kết quả cuối cùng.
- `/khaobai vietgiay` được giữ nguyên.
- Leo Núi và Boss vẫn từng câu vì đây là chế độ thi thời gian thực dùng deadline server và bảng điểm chung. Bí Cảnh vẫn từng câu 15 giây theo thiết kế Phase 5.1.

## 6. Kịch bản kiểm thử Discord

1. Dùng tài khoản có dưới 100 XP chạy `/tongmon tao`; bot phải từ chối.
2. Cộng XP bằng công cụ admin test, tạo Tông Môn, rồi thử tạo Tông Môn thứ hai; bot phải từ chối.
3. Tài khoản B gửi `/tongmon xin`, Tông Chủ xem `/tongmon don` và duyệt.
4. Thử bổ nhiệm, giáng chức, chuyển giao, rời và trục xuất; kiểm tra đúng quyền.
5. Thành viên hoàn thành một phiên chính tả 10 câu; `/tongmon donggop` tăng 10 CP. Mở lại interaction cũ không được tăng lần nữa.
6. Hoàn thành Thiên Kiếp/Bí Cảnh/Vấn Đỉnh/Boss hợp lệ và kiểm tra đúng mức CP.
7. Tạo nhiều reward trong một ngày; CP cá nhân dừng ở 100 nhưng XP Phase 4 vẫn dùng cap riêng 200.
8. Cấu hình Thiên Bảng, thay đổi XP, đợi tối đa 1 phút khi bảng đang dirty; message cũ phải được edit, không sinh message trùng.
9. Xóa message Thiên Bảng rồi chạy `hanhdong:capnhat`; bot phải tạo và lưu message mới.
10. Restart bot, kiểm tra Tông Môn, ledger, nhiệm vụ và cấu hình Thiên Bảng còn nguyên.

## 7. Supabase và Render

Sau khi đã backup, chạy migration **một lần từ máy local** bằng migration URL. Lệnh này ghi schema Phase 6 lên Supabase production:

```powershell
npm.cmd run db:pg:backup
npm.cmd run db:pg:migrate
npm.cmd run db:pg:audit
```

Không chạy `db:pg:import` nếu Supabase đang có dữ liệu mới hơn SQLite. Migration `004_phase6_sects_leaderboard.sql` chỉ tạo bảng mới và ghi schema version 4, không xóa bảng/dữ liệu cũ.

Sau đó đăng ký lại commands và deploy:

```powershell
npm.cmd run register
npm.cmd run build
```

Trên Render giữ `DATABASE_PROVIDER=postgres`, `SUPABASE_DATABASE_URL` là runtime pooler, và chạy Start Command `npm run start`. `SUPABASE_MIGRATION_URL` chỉ cần trên máy thực hiện migration; không cần đặt trong Render runtime.

## 8. Giới hạn có chủ đích

Phase 6 không có PvP, Tông Môn Đại Chiến, chiếm lãnh thổ, vật phẩm hay shop. Discord không hỗ trợ slash command vừa gọi root `/bangxeptuvi` vừa có subcommand thật, nên thao tác admin dùng option `hanhdong` để vẫn giữ được lệnh xem mặc định đúng yêu cầu.
