# Signal Log Analytics

MVP Next.js dùng để phân tích và theo dõi log OpenText/Micro Focus Service Manager.

## Tính năng hiện tại

- Chọn một hoặc nhiều file `.log`/`.txt` có sẵn trong thư mục `logs_files`.
- Upload đồng thời nhiều file `.log`/`.txt` và phân tích trực tiếp trong trình duyệt.
- Parse process ID, thread ID, timestamp, component, level và message.
- Ghép các dòng tiếp diễn/stack trace với log đứng trước.
- Chuẩn hóa dữ liệu động và nhóm lỗi tương tự.
- Phân loại lỗi JavaScript, database, schema, license và performance.
- Dashboard thống kê level, component, xu hướng theo giờ và nhóm sự cố.
- Parser chạy trong Web Worker để không khóa giao diện khi xử lý file lớn.
- Tự động lưu tối đa 30 phiên phân tích gần nhất và cho phép mở lại.

## Chạy dự án

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`, sau đó chọn file trong `logs_files` hoặc tải nhiều file từ máy.

## Kiến trúc MVP

Parser nằm tại `lib/log-parser.ts`. File được xử lý ở client nên log nhạy cảm không rời khỏi trình duyệt. Khi cần xử lý file rất lớn hoặc theo dõi liên tục, có thể chuyển parser sang worker/queue mà không cần thay đổi mô hình kết quả dashboard.

Lịch sử được lưu dạng summary tại `data/analysis-history.json`; nội dung log thô và danh sách event không được lưu. Khi triển khai nhiều người dùng, thay kho local này bằng PostgreSQL.
