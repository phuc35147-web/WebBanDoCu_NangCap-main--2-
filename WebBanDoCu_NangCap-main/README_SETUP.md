# Chợ Đồ Cũ — hướng dẫn cài đặt

Website mua bán đồ cũ: Node.js + Express + SQL Server, kiến trúc 3 lớp (DAL / BLL / Controller).

## Chạy trên máy dev
```bash
npm install
cp .env.example .env        # rồi sửa: NODE_ENV=development, DB_*, JWT_SECRET, ADMIN_*
npm start                   # dev tự migrate (AUTO_MIGRATE mặc định bật)
npm test                    # test đơn vị
```
Tạo database lần đầu: chạy `database/WebBanDoCu_NEW.sql` (script này **không** xóa dữ liệu). Làm lại từ đầu trên máy dev: chạy `database/RESET_DEV_DATABASE.sql` rồi script trên.

## Triển khai production (checklist)
- `NODE_ENV=production`, `SEED_DEMO=false`. Server **từ chối khởi động** nếu `JWT_SECRET` < 32 ký tự / là giá trị mẫu, `ADMIN_PASSWORD` yếu hoặc là mật khẩu mẫu, hay `SEED_DEMO=true`.
- `TRUST_PROXY=1` nếu có Nginx/Cloudflare/PaaS phía trước (cần để rate limit theo đúng IP).
- `AUTO_MIGRATE=false`; chạy `npm run migrate` bằng tài khoản `DB_MIGRATE_USER` (quyền DDL). Tài khoản `DB_USER` của ứng dụng chỉ cần đọc/ghi dữ liệu.
- `DB_ENCRYPT=true` (và `DB_TRUST_CERT=false` nếu có chứng chỉ hợp lệ). Dùng HTTPS để HSTS có hiệu lực.
- Tạo Google Maps API key **mới** (key cũ từng bị lộ), giới hạn theo IP; xem `docs/PHAP_LY_VA_BAN_QUYEN.md`.
- Điền `public/js/site-config.js` (hotline, email, địa chỉ...). Mục trống tự ẩn.
- Chạy `npm run prepare:sri` (cần Internet) để thêm SRI cho Bootstrap/Bootstrap Icons từ CDN.
- Bật 2FA cho admin: đăng nhập admin rồi gọi `POST /api/admin/2fa/setup` → quét `otpauthUrl` bằng Google Authenticator → `POST /api/admin/2fa/enable {code}`.
- Docker: `docker build -t chodocu .`

## Cấu trúc
`server.js` · `src/{controllers,bll,dal,routes,middleware,services,utils,config}` · `public/` · `database/` · `test/` · `docs/`
