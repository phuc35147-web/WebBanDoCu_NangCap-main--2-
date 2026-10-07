# Ghi chú pháp lý & bản quyền (cần luật sư rà soát)

Đây là ghi chú kỹ thuật, **không phải tư vấn pháp lý**.

## Việc chủ website phải tự làm
1. **Điền thông tin thật** trong `public/js/site-config.js` (hotline, email, địa chỉ, tên đơn vị, MST). Mục để trống sẽ tự ẩn.
2. **Thông báo / đăng ký website TMĐT với Bộ Công Thương**: hỏi luật sư xem mô hình (sàn đăng tin trung gian, có/không có đặt hàng, thanh toán trực tuyến) thuộc diện *thông báo* hay *đăng ký* theo Nghị định 52/2013/NĐ-CP (sửa đổi bởi NĐ 85/2021/NĐ-CP). Sau khi có, ghi vào `ecommerceNotice`.
3. **Rà soát 4 trang** `terms.html`, `privacy.html`, `regulations.html`, `contact.html` (là bản mẫu) rồi xóa khung "Lưu ý cho chủ website".
4. **Bảo vệ dữ liệu cá nhân (NĐ 13/2023/NĐ-CP)**: hỏi luật sư về hồ sơ đánh giá tác động xử lý dữ liệu và thông báo cho Bộ Công an nếu thuộc diện.
5. **Điền tên chủ sở hữu** vào file `LICENSE` (đang để placeholder). Nếu không muốn mã nguồn được tái sử dụng tự do, hãy đổi sang giấy phép khác và sửa `package.json`.
6. Nếu repo công khai: kiểm tra lại toàn bộ ảnh trong `uploads/` (chỉ giữ ảnh bạn sở hữu / có quyền dùng).

## Đã xử lý trong code
- Đăng ký bắt buộc tick đồng ý Điều khoản + Chính sách bảo mật, lưu thời điểm đồng ý (`NguoiDung.NgayDongYDieuKhoan`).
- Lý do báo cáo "Vi phạm bản quyền / ảnh ăn cắp" + quy trình gỡ tin ở trang Liên hệ / Điều khoản.
- Điều khoản cấp phép nội dung người dùng đăng (mục 3 trong `terms.html`).
- Đã xóa ảnh chụp màn hình VS Code khỏi `uploads/` và khỏi danh sách cho phép của `.gitignore`.
- Đổi tên `FEATURE_CHOTOT_MIGRATION.sql` → `FEATURE_ENHANCEMENTS_MIGRATION.sql`, bỏ chữ "Chợ Tốt" khỏi README.

## Tọa độ địa chỉ & điều khoản Google Maps Platform
Ứng dụng gọi Geocoding API rồi **lưu vĩnh viễn** vĩ độ/kinh độ vào `SanPhamDoCu.ViDo/KinhDo`. Điều khoản của Google Maps Platform hạn chế việc lưu trữ/cache kết quả geocode (thường chỉ cho phép lưu `place_id` lâu dài; tọa độ chỉ được cache tạm thời, và mục đích sử dụng phải phù hợp). Vì điều khoản thay đổi theo thời gian, **hãy đọc bản hiện hành** và chọn một trong các hướng:
- Dùng dịch vụ geocode cho phép lưu trữ (ví dụ OpenStreetMap Nominatim self-host / nhà cung cấp có giấy phép lưu), hoặc
- Chỉ lưu `place_id` và geocode lại khi cần, hoặc
- Đặt `GEOCODING_ENABLED=false` để tắt hẳn (sắp xếp "gần nhất" sẽ không có dữ liệu).
Đồng thời tạo **API key mới** (key cũ từng bị lộ qua `/api/config/maps`), giới hạn theo IP máy chủ và chỉ bật Geocoding API.
