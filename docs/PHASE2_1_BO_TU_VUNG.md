# Phase 2.1 — Bộ Từ Vựng (Decks) cho Hán Ngữ Tu Tiên

## Đầu ra

Tạo nhiều bộ từ riêng (gia đình, trường học, HSK1...), thêm từ từ CVDICT, chuyển/bỏ từ, bật công khai trong **cùng Discord server**, cho đạo hữu khác xem và **sao chép** về bộ riêng.

- Không tạo lại Bot Token, Discord Application hay database CVDICT.
- Không mất `saved_words` đang có ở Phase 2.
- Từ thêm vào Deck cũng được thêm vào `saved_words` trong **một transaction**.
- Bỏ từ khỏi Deck hoặc xóa Deck **không xóa** mục từ trong `saved_words`.
- Bộ công khai **chỉ xem/sao chép** được; chỉ chủ sở hữu mới sửa/xóa.
- Tối đa 25 Deck/người/server (giới hạn Discord select menu), tối đa 500 từ/Deck bản này.
- Sao chép tạo Deck mới, mặc định riêng tư, **không** thay đổi bản gốc.
- Bản đầu chưa có chia sẻ xuyên server và chưa có tùy chỉnh nghĩa riêng theo Deck.

## Bước A. Sao lưu trước khi sửa

Mở PowerShell trong dự án đang chạy:

```powershell
cd "D:\Bot_Discord\HanNguTuTien_Dictionary_Starter\han-ngu-tu-tien-starter"
```

**Dừng bot** đang chạy bằng `Ctrl + C`. Sau đó sao lưu **database tiến độ** bằng Python `sqlite3.backup`:

```powershell
py -c "import sqlite3; a=sqlite3.connect('data/progress.sqlite'); b=sqlite3.connect('data/progress-backup-phase2.sqlite'); a.backup(b); a.close(); b.close()"
```

Có thể tạo thêm bản sao thư mục dự án (hoặc commit Git) trước khi chép patch, đặc biệt nếu đã tự sửa code Phase 2.

**Tuyệt đối không xóa** `data/progress.sqlite`, `.env`, `data/raw/cvdict.sqlite`, `data/cvdict-app.sqlite`.

## Bước B. Giải nén patch

Tải file `HanNguTuTien_Phase2_1_Patch.zip` và chép vào thư mục dự án, hoặc sửa đường dẫn theo vị trí tải file:

```powershell
Expand-Archive -LiteralPath ".\HanNguTuTien_Phase2_1_Patch.zip" -DestinationPath "." -Force
```

Patch chứa `src/`, `tests/`, tài liệu và không chứa token hay database. Không cần `npm init` hoặc `npm install` thêm package mới.

Nếu bạn đã thay đổi `bot.ts`, `main.ts` hoặc `command-registry.ts` từ sau Phase 2, **so sánh trước khi chép đè** để tránh mất thay đổi của riêng mình.

## Bước C. Kiểm tra phiên bản database

Vẫn dùng `.env` của Phase 2, cụ thể:

```dotenv
DICTIONARY_DB_PATH=./data/cvdict-app.sqlite
PROGRESS_DB_PATH=./data/progress.sqlite
```

Khi `npm run dev` chạy lần đầu, migration từ schema version 1 lên version 2 sẽ tự chạy, tạo hai bảng mới:

- `decks`: ID, người sở hữu, tên, mô tả, trạng thái công khai, ngày tạo.
- `deck_words`: liên kết bộ từ với CVDICT entry IDs, `ON DELETE CASCADE`.

Dữ liệu cũ `saved_words` được giữ nguyên. `cvdict-app.sqlite` vẫn được mở ở chế độ chỉ đọc.

## Bước D. Chạy kiểm thử và build

```powershell
npm test
npm run typecheck
npm run build
```

Nếu một lệnh lỗi, gửi phần log lỗi và tên file (không gửi `.env` hoặc token). Bản patch đã có `tests/decks.test.ts` kiểm tra migration, bảo mật quyền truy cập, lưu trùng, clone, chuyển và xóa.

## Bước E. Đăng ký Slash Commands + chạy bot

```powershell
npm run register
npm run dev
```

Lệnh `register` đăng ký **5 command cấp cao**: `/ping`, `/help`, `/tudien`, `/tuikho`, `/botu` (lệnh `/botu` chứa 10 subcommand).

## Bước F. Thử trên Discord theo thứ tự

1. Gõ `/botu tao ten:HSK 1 mota:Từ cơ bản`.
2. Gõ `/botu tao ten:Gia đình`.
3. Gõ `/botu danhsach` → mỗi bộ sẽ có mã `#ID`.
4. Gõ `/tudien` với `tu:再见`. Bot hiển thị mã từ (`#entry_id`) và 2 hàng nút: lưu Túi / thêm vào Bộ.
5. Nhấn **Thêm 再见 vào bộ** → chọn `HSK 1` từ menu.
6. Gõ `/botu xem id:<ID của HSK 1>` → từ xuất hiện trong bộ.
7. Gõ `/tuikho` → từ cũng xuất hiện trong Túi Càn Khôn.
8. Gõ `/botu chuyen tu:<ID HSK 1> den:<ID Gia đình> matu:<entry_id>` → chuyển bộ.
9. Gõ `/botu congkhai id:<ID Gia đình> bat:true`.
10. Dùng tài khoản Discord thứ hai **trong cùng server**: `/botu khampha`, `/botu xem id:<ID Gia đình>`, `/botu saochep id:<ID Gia đình> ten:Bộ của mình`.
11. Kiểm tra tài khoản thứ hai không thể thêm/xóa từ trong bộ của tài khoản thứ nhất.
12. Gõ `/botu xoa id:<ID của mình>` → nhấn **Xác nhận xóa bộ**; sau đó `/tuikho` vẫn còn các từ đã lưu.
13. Tắt bot rồi khởi động lại → kiểm tra Decks và túi từ còn nguyên.

**Cách dùng lệnh thủ công nếu không muốn dùng nút:**

```text
/botu them id:1 matu:12345
/botu bo id:1 matu:12345
/botu xem id:1 trang:2
/botu congkhai id:1 bat:false
```

Các ID chỉ là ví dụ; phải thay bằng ID được bot hiển thị.

## Phân biệt các thao tác

- `/tudien` → tìm mục từ trong **CVDICT**.
- `/tuikho` → từ đã lưu thuộc riêng người chơi trong server.
- `/botu` → sắp xếp các từ vào **bộ**; một mục từ có thể ở nhiều bộ.
- `/botu bo` → chỉ bỏ từ khỏi bộ, không mất trong Túi.
- `/botu saochep` → tạo một bản sao độc lập và thêm các từ đó vào Túi cá nhân.
- `/botu congkhai` → người khác trong **cùng server** được đọc/sao chép, không có quyền sửa.

## Vì sao cấu trúc này dễ mở rộng?

```text
src/modules/decks/
  domain/deck.types.ts
  application/deck.service.ts
  infrastructure/migrations.ts
  infrastructure/sqlite-deck.repository.ts
  presentation/botu.command.ts
  presentation/deck-interaction.handler.ts
  presentation/deck-ui.ts
  index.ts
```

- Handler Discord tiếp nhận tương tác, không tự truy vấn SQL.
- `DeckService` kiểm tra quyền sở hữu, mức giới hạn, dữ liệu mục từ.
- Repository chỉ truy cập `progress.sqlite` và chịu trách nhiệm các thao tác atomic.
- Dictionary Service được tái sử dụng read-only, không thay đổi dataset CVDICT.
- Flashcard/Sư Phụ Khảo Bài sau này có thể truy vấn Deck Service thay vì tự cài bộ từ khác.

## Troubleshooting

**Không thấy `/botu`**: dừng bot, chạy `npm run register` lại, xem server test có trùng Guild ID trong `.env` không. Đợi Discord đồng bộ lệnh hoặc khởi động lại ứng dụng Discord.

**`No such table: decks`**: đảm bảo bot đã chạy lại bằng source Phase 2.1 và `PROGRESS_DB_PATH` trỏ tới đúng database. Đừng tự xóa database để sửa; gửi log để kiểm tra migration.

**`Mã bộ không tồn tại`**: `/botu danhsach` lấy ID thực tế, tránh dùng ID ví dụ.

**`Riêng tư`**: chỉ chủ sở hữu xem được nếu chưa bật công khai. Chia sẻ hiện chỉ trong một server.

**Bot vẫn offline sau khi đóng terminal**: bot đang chạy local. Hosting 24/7 triển khai sau, với `progress.sqlite` đặt trên persistent volume.

**Không đủ 25 Deck để chọn**: giới hạn bản này có 25 bộ cá nhân để phù hợp số option tối đa của menu Discord; có thể làm phân trang sau.

## Kiểm thử kỹ thuật đã làm trong môi trường soạn patch

- Đối chiếu đúng source Phase 2 có sẵn.
- Kiểm tra cú pháp/transpile các file TypeScript.
- Chạy thử migration SQL bằng SQLite, xác minh không mất dữ liệu `saved_words`, chặn từ trùng, xóa bộ có cascade đúng.

Chưa chạy được toàn bộ `npm test`, `typecheck` và bot Discord trong môi trường tạo patch vì registry npm không truy cập được ở đây; bạn cần chạy các lệnh ở Bước D trên máy Windows của mình.
