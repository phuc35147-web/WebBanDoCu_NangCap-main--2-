USE WebBanDoCu;
GO

/*
  LUỒNG ĐĂNG TIN MỚI:
  - Bất kỳ tài khoản đã đăng nhập nào cũng được đăng tin.
  - Không cần đăng ký người bán.
  - Tin mới luôn có trạng thái N'Chờ duyệt'.
  - Chỉ Admin mới được chuyển tin sang N'Đang bán'.
  - MaNguoiBan chỉ lưu MaNguoiDung của người đăng tin để phục vụ chat/đơn hàng.
*/

IF OBJECT_ID(N'dbo.TR_SanPhamDoCu_CheckSeller', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_SanPhamDoCu_CheckSeller;
GO
