/* =========================================================
   TÙY CHỌN - CHỈ CHẠY SAU KHI ĐÃ KHỞI ĐỘNG SERVER BẢN MỚI ÍT NHẤT MỘT LẦN
   (server sẽ tự gỡ ràng buộc DanhGia -> DonHang trước).

   Xóa VĨNH VIỄN dữ liệu đơn hàng, địa chỉ giao hàng và đăng ký người bán cũ. Hãy backup trước nếu cần giữ lịch sử.
   Không chạy file này cũng không sao: code mới không còn dùng các bảng này.
   ========================================================= */
USE WebBanDoCu;
GO

/* Chặn xóa nếu DanhGia vẫn còn khóa ngoại tới DonHang (nghĩa là chưa khởi động server bản mới) */
IF EXISTS (SELECT 1 FROM sys.foreign_keys
           WHERE parent_object_id = OBJECT_ID(N'dbo.DanhGia') AND referenced_object_id = OBJECT_ID(N'dbo.DonHang'))
BEGIN
    RAISERROR(N'DanhGia vẫn còn khóa ngoại tới DonHang. Hãy chạy npm start (bản mới) một lần rồi chạy lại file này.', 16, 1);
    SET NOEXEC ON;
END
GO

IF OBJECT_ID(N'dbo.vw_ThongKeBanHang', N'V') IS NOT NULL DROP VIEW dbo.vw_ThongKeBanHang;
IF OBJECT_ID(N'dbo.ChiTietDonHang', N'U') IS NOT NULL DROP TABLE dbo.ChiTietDonHang;
IF OBJECT_ID(N'dbo.DonHang', N'U') IS NOT NULL DROP TABLE dbo.DonHang;
IF OBJECT_ID(N'dbo.DiaChiNguoiDung', N'U') IS NOT NULL DROP TABLE dbo.DiaChiNguoiDung;
/* Bảng đăng ký "người bán" của mô hình cũ (không còn dùng) */
IF OBJECT_ID(N'dbo.NguoiBan', N'U') IS NOT NULL DROP TABLE dbo.NguoiBan;
GO
SET NOEXEC OFF;
GO
