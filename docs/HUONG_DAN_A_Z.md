# Hướng dẫn A–Z — Hán Ngữ Tu Tiên / Dictionary Module v1

Hướng dẫn sử dụng bot dành cho thành viên và quản trị viên Discord: [Hướng dẫn người dùng](./HUONG_DAN_NGUOI_DUNG.md).

## 0. Mục tiêu

Có `/tudien` tra từ giản thể/phồn thể/Pinyin/tiếng Việt trên Discord. Dữ liệu CVDICT giữ nguyên. Bot chỉ đọc một bản sao tối ưu tìm kiếm. Phần XP, chính tả, TTS, flashcard sẽ triển khai sau.

## 1. Chuẩn bị

1. Windows + VS Code + PowerShell.
2. Python 3 (`py --version`).
3. Node.js >= 24.17.0 (`node -v`), npm (`npm -v`). Nếu vừa đổi Node, tắt rồi mở lại terminal.
4. Tài khoản Discord và một server riêng để thử bot.
5. File `cvdict.sqlite` đã import từ CVDICT.u8, cấu trúc `entries`, `meanings`.

## 2. Giải nén project

Giải nén `HanNguTuTien_Dictionary_Starter.zip` vào một thư mục không có dấu cách/ký tự kỳ lạ nếu muốn giảm rủi ro công cụ dòng lệnh. Mở thư mục `han-ngu-tu-tien-starter` bằng VS Code, chọn Terminal > New Terminal.

Chạy:

```powershell
node -v
npm -v
py --version
npm install
```

## 3. Chuẩn bị từ điển

Không thay đổi file CVDICT gốc. Tạo thư mục và copy file:

```powershell
New-Item -ItemType Directory -Force data/raw
Copy-Item "D:\English\cvdict.sqlite" "data/raw/cvdict.sqlite"
```

> Thay `D:\English\cvdict.sqlite` bằng đường dẫn thực tế của bạn.

Chạy:

```powershell
py scripts/prepare_dictionary.py data/raw/cvdict.sqlite data/cvdict-app.sqlite
```

Kết quả đúng từ database mà bạn đã gửi: `Entries: 122,595; Meanings: 200,195`, cùng thông báo `OK`. Nếu cần tạo lại file sau khi sửa nguồn, thêm `--force` vào cuối lệnh.

File `data/cvdict-app.sqlite` có thêm cột `pinyin_plain`, chỉ mục và bảng FTS5 `meanings_fts`. Đây là file bot sử dụng. Nó KHÔNG nằm trong ZIP để tránh chuyển dữ liệu lớn và vấn đề phân phối dữ liệu có giấy phép riêng.

## 4. Kiểm tra module mà chưa cần Discord

```powershell
npm run check:db
npm test
npm run typecheck
npm run build
```

`check:db` phải tìm được từ `学习`, `學習`, Pinyin `xuexi` và nghĩa Việt `học`. Nếu `xuexi` trả nhiều mục từ là bình thường: bỏ thanh điệu có thể tạo ra đồng âm khác thanh.

## 5. Tạo bot trên Discord Developer Portal

1. Truy cập https://discord.com/developers/applications
2. New Application > đặt tên (ví dụ Hán Ngữ Tu Tiên).
3. Trong General Information lấy **Application ID**.
4. Trong Bot tạo/reset token và sao chép vào nơi an toàn. **Không công khai token.**
5. Installation: chọn **Guild Install**, scopes **bot** và **applications.commands**; cấp quyền View Channel, Send Messages, Embed Links. Lấy Install Link và thêm bot vào server test.
6. Discord Settings > Advanced > bật Developer Mode. Chuột phải server test > Copy Server ID.
7. Bot chỉ dùng Gateway intent `Guilds`, không cần Message Content Intent.

## 6. Cấu hình .env

Trong PowerShell tại project root:

```powershell
Copy-Item .env.example .env
```

Mở `.env` rồi thay ba giá trị đầu; ví dụ:

```dotenv
DISCORD_TOKEN=YOUR_REAL_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_APPLICATION_ID
DISCORD_DEV_GUILD_ID=YOUR_TEST_SERVER_ID
DICTIONARY_DB_PATH=./data/cvdict-app.sqlite
```

Dán token thật vào file `.env` của bạn. **Không gửi token cho người khác, không commit GitHub.**

## 7. Đăng ký slash commands và chạy

```powershell
npm run register
npm run dev
```

Khi bot online sẽ hiển thị `✅ Bot online: ...`.

Vào server, thử:

- `/ping`
- `/help`
- `/tudien tu:学习`
- `/tudien tu:學習`
- `/tudien tu:xuexi kieu:Pinyin`
- `/tudien tu:học kieu:Nghĩa tiếng Việt`
- `/tudien tu:行`

Kết quả `/tudien` và hồ sơ `/tuvi` hiển thị công khai để mọi người cùng xem. Các lệnh có dữ liệu cá nhân như `/tuikho` vẫn trả lời riêng tư.

Admin có quyền Manage Server đăng ký lệnh rồi dùng `/xpkenh dat` để chọn kênh công khai nhận thông báo mỗi khi thành viên được cộng XP. Dùng `/xpkenh xoa` để tắt.

## 8. Cách code vận hành

`app/bot.ts` nhận interaction từ Discord > `presentation/tudien.command.ts` trả lời bằng Embed > `application/dictionary.service.ts` xác định kiểu tra cứu > `infrastructure/sqlite-dictionary.repository.ts` truy vấn bằng Drizzle và prepared SQL FTS5 > `shared/database` mở SQLite read-only.

Quy tắc thêm tính năng: code Discord mới đặt trong `presentation`, nghiệp vụ trong `application/domain`, truy vấn trong `infrastructure`. Các module XP/Quest/Leo Núi gọi Dictionary API công khai, không truy cập trực tiếp bảng từ điển từ handler của chúng.

## 9. Lỗi phổ biến

Xem `docs/TROUBLESHOOTING.md`. Những lỗi hay gặp nhất là Node chưa đủ mới, quên `npm install`, nhầm đường dẫn `.env`, trỏ vào `cvdict.sqlite` gốc thay vì `cvdict-app.sqlite`, sai Guild ID, chưa chạy `npm run register`.

## 10. Khi chuyển lên cloud

`npm run build` để tạo `dist/`, `npm start` để khởi động. Trên cloud cần cung cấp file `cvdict-app.sqlite` ở đúng đường dẫn, thông qua một cơ chế lưu trữ/triển khai phù hợp với giấy phép của dữ liệu. File này bị `.gitignore` bỏ qua, vì vậy **chỉ push GitHub sẽ không tự đưa DB lên Railway**. Sau này ta có thể tạo volume hoặc bước khởi tạo dữ liệu riêng. XP, streak và tiến độ học phải lưu trong một database ghi được khác, có backup, chứ không ghi vào CVDICT.

## 11. Chưa làm trong v1

Các tính năng được triển khai theo từng phase. Phase 3 hiện có `/khaobai` dùng Piper TTS offline (Azure Speech là tùy chọn); xem `PHASE3_KHAO_BAI.md`. HSK, XP và các hệ thống tu tiên nâng cao vẫn thuộc các phase sau.
