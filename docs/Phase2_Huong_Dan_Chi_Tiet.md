# Hán Ngữ Tu Tiên — Phase 2: Túi Càn Khôn (copy/paste patch)

## Mục tiêu

Từ một mục từ trong `/tudien`, bấm **Lưu** để thêm vào kho từ của chính mình; dùng `/tuikho` để xem và bỏ từ. Một mục từ được lưu **tối đa một lần** cho cùng tài khoản trong cùng Discord server.

## Bước 0 — Sao lưu

Tại thư mục `D:\Bot_Discord\HanNguTuTien_Dictionary_Starter\han-ngu-tu-tien-starter`, **dừng bot bằng Ctrl+C** trước khi thay code. Đóng terminal chạy `npm run dev`.

Sao lưu `.env` và cả thư mục `data` trước khi làm. Không gửi `.env` lên GitHub/ChatGPT.

## Bước 1 — Giải nén bản Patch

- Tải `HanNguTuTien_Phase2_Patch.zip`.
- Giải nén vào **thư mục gốc dự án đang dùng**, giữ cấu trúc `src/`, `tests/`, `scripts/`, `docs/` (merge/replace các file cùng tên).
- Tuyệt đối **không xóa thư mục cũ**: ZIP patch không chứa token, dataset hay database của bạn.

Cách PowerShell (chạy bên trong thư mục gốc):

```powershell
Expand-Archive -LiteralPath "D:\Downloads\HanNguTuTien_Phase2_Patch.zip" -DestinationPath "." -Force
```

Nếu file tải về ở vị trí khác, thay đường dẫn cho đúng.

## Bước 2 — Cấu hình .env

Giữ các biến Discord cũ đang chạy tốt và thêm:

```dotenv
PROGRESS_DB_PATH=./data/progress.sqlite
```

File `data/progress.sqlite` sẽ được tạo khi `npm run dev` khởi động. **Không chép progress vào `cvdict-app.sqlite`.**

## Bước 3 — Kiểm tra chất lượng code

```powershell
npm test
npm run typecheck
npm run build
```

Các bài kiểm tra bổ sung bao gồm lưu trùng từ, xóa, cô lập hai người học, cô lập hai server. Nếu có lỗi, gửi toàn bộ log lỗi, không gửi token.

## Bước 4 — Đăng ký lại slash commands

```powershell
npm run register
```

Khi thành công sẽ đăng ký 4 lệnh: `/ping`, `/help`, `/tudien`, `/tuikho`.

## Bước 5 — Chạy bot

```powershell
npm run dev
```

Bot sẽ mở database từ điển ở chế độ read-only và mở database tiến độ ở chế độ read-write. SQL migration v1 chạy tự động.

## Bước 6 — Test trực tiếp trong Discord

1. `/tudien` → `tu` = `再见`.
2. Bên dưới kết quả có nút **Lưu 再见**. Nhấn nút.
3. Bot trả **Đã thu thập 再见 vào Túi Càn Khôn!**
4. Nhấn Lưu thêm lần nữa: bot phải nói đã có trong túi, không nhân đôi dữ liệu.
5. `/tuikho` → phải có `再见` cùng Pinyin và nghĩa.
6. `/tudien` → tra `学习`, nhấn Lưu.
7. `/tuikho` → tổng cộng 2 mục từ.
8. Nhấn **Bỏ 再见** → còn lại 1 mục từ, không ảnh hưởng tới dictionary.
9. Thử bằng tài khoản khác → túi của họ ban đầu phải trống.
10. Tắt/bật `npm run dev`, chạy `/tuikho` → từ đã lưu phải còn nguyên.

## Hệ thống file

```text
src/modules/bag/
  domain/bag.types.ts                     # interface dữ liệu người dùng
  application/bag.service.ts              # lưu, bỏ, tra túi
  infrastructure/sqlite-bag.repository.ts # đọc/ghi progress DB bằng Drizzle
  infrastructure/migrations.ts            # migration v1
  presentation/bag-ui.ts                  # nút Lưu, nút Bỏ, danh sách
  presentation/bag-button.handler.ts      # nhận nút Discord
  presentation/tuikho.command.ts          # lệnh /tuikho
  index.ts                                # public API

src/shared/database/
  bag-schema.ts                           # Drizzle schema bảng saved_words
  open-progress.ts                        # khởi tạo SQLite người dùng
```

## Vì sao tách hai database?

- `cvdict-app.sqlite`: dữ liệu CVDICT gốc/đã chuẩn bị, luôn **read-only**.
- `progress.sqlite`: dữ liệu người dùng, sắp tới chứa XP, nhiệm vụ, flashcards.
- Dữ liệu túi hiện dùng `entryId` tham chiếu tới ID mục từ gốc trong CVDICT. Nếu import bộ từ khác làm đổi ID phải chạy mapping migration trước.

## Xử lý lỗi

- `/tuikho` không hiện: chạy lại `npm run register`, kiểm tra biến Guild ID, restart Discord nếu cần.
- `Cannot find module`: chạy `npm install` trong đúng thư mục dự án.
- `Missing ...`: kiểm tra `.env`.
- `SQLITE_CANTOPEN`: kiểm tra quyền ghi vào thư mục `data`.
- Nút bấm không phản hồi: kiểm tra `npm run dev` vẫn đang chạy và log terminal.
- Không thấy từ sau khi restart: kiểm tra `PROGRESS_DB_PATH` có đang trỏ tới cùng file hay không.

## Vận hành

Trong local, dữ liệu túi được lưu bền trên ổ đĩa. Khi đưa lên Railway, **bắt buộc dùng persistent volume** chứa database người dùng. Không đưa `.env` hoặc progress DB lên GitHub.

## Giới hạn của Phase 2 này

Đã có túi từ cá nhân, xem/xóa; chưa có nhiều deck đặt tên, SRS, XP, role, audio. Những chức năng đó sẽ xây dựng dần, dựa trên nền tảng Bag Service.
