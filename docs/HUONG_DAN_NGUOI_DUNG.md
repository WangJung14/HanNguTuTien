# Hướng dẫn sử dụng Hán Ngữ Tu Tiên

Tài liệu này dành cho thành viên và quản trị viên Discord. Bạn không cần cài phần mềm hay biết lập trình để dùng bot.

## Mở menu lệnh

Trong khung chat Discord, gõ `/menu` hoặc `/help`, sau đó chọn lệnh hiện ra. Bot gửi bảng hướng dẫn riêng cho bạn, người khác không thấy tin nhắn menu đó.

## Tra từ và tạo bộ từ

### Tra từ điển

1. Gõ `/tudien`.
2. Nhập từ cần tìm ở ô `tu`, ví dụ `学习`, `xuexi` hoặc `học`.
3. Nếu cần, chọn kiểu tìm kiếm ở ô `kieu`.

Kết quả tra từ hiển thị công khai trong kênh để mọi người cùng xem. Các nút lưu từ hoặc thêm từ vào bộ chỉ người đã tra mới dùng được.

### Lưu và gom từ

- `/tuikho` — xem các từ bạn đã lưu; đây là thông tin riêng của bạn.
- `/botu tao` — tạo bộ từ mới. Nhập tên bộ.
- `/botu danhsach` — xem bộ từ của bạn.
- `/botu them` — thêm một từ vào bộ. Dùng mã từ hiển thị trong kết quả `/tudien` và mã bộ từ của bạn.
- `/botu xem` — xem từ trong bộ.
- `/botu khampha` — xem bộ từ được chia sẻ công khai trong server.

Khi dùng `/botu`, Discord sẽ hướng dẫn chọn các mục như `tao`, `them` hoặc `xem`. Bộ từ mới mặc định là riêng tư. Chỉ bật chia sẻ khi bạn muốn thành viên khác xem hoặc sao chép bộ đó.

## Khảo bài

Trước tiên, hãy tạo bộ từ có ít nhất 5 từ đủ điều kiện.

- `/khaobai batdau` — chọn bộ từ và số câu; nghe rồi nhập đáp án trong cửa sổ bot mở ra.
- `/khaobai vietgiay` — chọn bộ từ và số câu; nghe để viết ra giấy, không cần gửi đáp án lên Discord.
- `/khaobai tieptuc` — mở lại phiên đang làm nếu bạn thoát hoặc bot vừa khởi động lại.

Các phiên khảo bài là riêng tư, chỉ bạn có thể thao tác. Mỗi server bạn chỉ có một phiên đang hoạt động cùng lúc.

## Tu vi, XP và nhiệm vụ

- `/tuvi` — xem cảnh giới và tổng XP. Hồ sơ này hiển thị công khai.
- Admin: `/xpadmin user:<thành viên>` — mở bảng thưởng/phạt tu vi.
- `/lichsutuvi` — xem lịch sử XP và các lần đột phá; nội dung chỉ bạn thấy.
- `/dotpha` — bắt đầu Thiên Kiếp khi đủ điều kiện. Discord sẽ yêu cầu chọn mã bộ từ.
- `/nhiemvu` — xem nhiệm vụ trong ngày.
- `/diemdanh` — xem chuỗi ngày học.
- `/bequan` — xem trạng thái Bế Quan.

XP có thể đến từ việc trả lời khảo bài đúng, hoàn thành phiên học, nhiệm vụ hoặc hoạt động khác. Nếu server đã chọn kênh thông báo XP, mỗi lần XP thực sự được cộng sẽ tạo một tin nhắn công khai trong kênh đó. Những lượt thưởng trùng hoặc không được cộng XP sẽ không gửi tin.

## Trò chơi

- `/leonui solo` — chơi Vấn Đỉnh một mình; chọn bộ từ khi Discord hỏi.
- `/leonui tao` — mở phòng Vấn Đỉnh để mọi người cùng tham gia.
- `/leonui thamgia` — vào phòng đang chờ trong kênh hiện tại.
- `/leonui batdau` — chủ phòng bắt đầu.
- `/leonui bangxep` — xem bảng xếp hạng server.
- `/leonui lichsu` — xem lịch sử của bạn.
- `/bicanh vao` — vào Bí Cảnh và chọn cấp HSK.
- `/bicanh lichsu` — xem lịch sử Bí Cảnh.
- `/boss xem` — xem lịch Boss HSK và trạng thái trong kênh hiện tại.

Một số thao tác chỉ dùng được khi phòng chơi đang mở. Discord sẽ báo nếu chưa có phòng hoặc bạn chưa đủ điều kiện.

## Dành cho quản trị viên

Các lệnh cấu hình cần quyền **Manage Server** (Quản lý máy chủ).

### Chọn kênh thông báo XP

1. Tạo hoặc chọn một kênh văn bản, ví dụ `#nhat-ky-tu-luyen`.
2. Gõ `/xpkenh dat`.
3. Chọn kênh muốn nhận thông báo.

Bot cần quyền **View Channel** và **Send Messages** tại kênh đó. Để tắt, dùng `/xpkenh xoa`.

### Thưởng công trạng hoặc phạt tu vi

1. Cấu hình kênh thông báo XP trước bằng `/xpkenh dat`.
2. Gõ `/xpadmin` và chọn thành viên ở ô `user`.
3. Bảng riêng tư hiện tu vi hiện tại. Chọn **Thưởng tu vi** hoặc **Phạt tu vi**.
4. Nhập số XP từ 1 đến 10.000 và ghi lý do. Lý do sẽ được đưa vào thông báo công khai.

Chỉ người có quyền **Manage Server** mới dùng được. Mức phạt không làm XP âm; nếu tổng XP thấp hơn mốc đại cảnh giới hiện tại, bot hạ đại cảnh giới về mức phù hợp và thử cập nhật role Discord. Bot lưu lại mỗi điều chỉnh để không áp dụng lặp nếu Discord gửi lại thao tác.

### Bế Quan và role cảnh giới

- `/bequancauhinh kenh` — chọn phòng thoại cho Bế Quan.
- `/bequancauhinh tat` — tắt Bế Quan trong server.
- `/canhgioirole gan` — gắn một role với cảnh giới.
- `/canhgioirole go` — bỏ gắn role khỏi cảnh giới.
- `/canhgioirole dongbo` — thử đồng bộ lại role cho thành viên.

Để bot tự cấp/gỡ role, hãy cho bot quyền **Manage Roles** và kéo role của bot lên cao hơn các role cảnh giới trong phần cài đặt vai trò của Discord.

## Quyền riêng tư

- Công khai: kết quả `/tudien`, hồ sơ `/tuvi`, phòng chơi và thông báo XP trong kênh đã cấu hình.
- Riêng tư: menu `/menu` và `/help`, `/tuikho`, lịch sử, nhiệm vụ cá nhân, cùng các phiên khảo bài.
- Thành viên khác không thể dùng nút để thay đổi túi từ, bộ từ riêng hoặc phiên học của bạn.
