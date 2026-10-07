/* =========================================================
   MIGRATION cho bản nâng cấp tính năng (đẩy tin, chặn, theo dõi, tìm kiếm đã lưu...)
   - Server Node cũng tự chạy các bước này khi khởi động,
     file này dành cho ai muốn chạy tay trong SSMS.
   - An toàn khi chạy nhiều lần (idempotent), KHÔNG xóa dữ liệu.
   ========================================================= */
USE WebBanDoCu;
GO

/* 1. Cột "đẩy tin": tin vừa đẩy được xếp lên đầu mục Mới nhất */
IF COL_LENGTH(N'dbo.SanPhamDoCu', N'NgayDayTin') IS NULL
    ALTER TABLE dbo.SanPhamDoCu ADD NgayDayTin DATETIME2 NULL;
GO

/* 2. Sửa constraint trạng thái: 'Từ chối' phải có tiền tố N */
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = N'CK_SanPham_Status' AND parent_object_id = OBJECT_ID(N'dbo.SanPhamDoCu')
             AND definition NOT LIKE N'%N''Từ chối''%')
BEGIN
    ALTER TABLE dbo.SanPhamDoCu DROP CONSTRAINT CK_SanPham_Status;
    ALTER TABLE dbo.SanPhamDoCu ADD CONSTRAINT CK_SanPham_Status
        CHECK (TrangThai IN (N'Chờ duyệt', N'Đang bán', N'Đã bán', N'Ẩn', N'Từ chối'));
END
GO

/* 3. Các bảng dùng cho Yêu thích / Thông báo / Nhật ký admin (tạo nếu DB cũ chưa có) */
IF OBJECT_ID(N'dbo.YeuThich', N'U') IS NULL
CREATE TABLE dbo.YeuThich(
    MaNguoiDung INT NOT NULL, MaSanPham INT NOT NULL, NgayThem DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    PRIMARY KEY(MaNguoiDung, MaSanPham),
    CONSTRAINT FK_YT_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
    CONSTRAINT FK_YT_Product FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE);
GO
IF OBJECT_ID(N'dbo.ThongBao', N'U') IS NULL
CREATE TABLE dbo.ThongBao(
    MaThongBao INT IDENTITY(1,1) PRIMARY KEY, MaNguoiDung INT NOT NULL, TieuDe NVARCHAR(255) NOT NULL,
    NoiDung NVARCHAR(1000) NOT NULL, DaDoc BIT NOT NULL DEFAULT 0, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_TB_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE);
GO
IF OBJECT_ID(N'dbo.AdminLog', N'U') IS NULL
CREATE TABLE dbo.AdminLog(
    MaLog BIGINT IDENTITY(1,1) PRIMARY KEY, AdminEmail VARCHAR(255) NOT NULL, HanhDong NVARCHAR(255) NOT NULL,
    DoiTuong NVARCHAR(100) NULL, MaDoiTuong INT NULL, NoiDung NVARCHAR(1000) NULL, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME());
GO
IF OBJECT_ID(N'dbo.EmailOtp', N'U') IS NULL
CREATE TABLE dbo.EmailOtp(
    OtpId INT IDENTITY(1,1) PRIMARY KEY, Email VARCHAR(255) NOT NULL, Purpose VARCHAR(24) NOT NULL,
    CodeHash CHAR(64) NOT NULL, ExpiresAt DATETIME2 NOT NULL, Attempts TINYINT NOT NULL DEFAULT 0,
    VerifiedAt DATETIME2 NULL, ConsumedAt DATETIME2 NULL, CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_EmailOtp_Purpose CHECK(Purpose IN('register','reset-password')));
GO

/* 4. Index */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ThongBao_User' AND object_id = OBJECT_ID(N'dbo.ThongBao'))
    CREATE INDEX IX_ThongBao_User ON dbo.ThongBao(MaNguoiDung, DaDoc, NgayTao DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_YeuThich_SanPham' AND object_id = OBJECT_ID(N'dbo.YeuThich'))
    CREATE INDEX IX_YeuThich_SanPham ON dbo.YeuThich(MaSanPham);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EmailOtp_Email_Purpose' AND object_id = OBJECT_ID(N'dbo.EmailOtp'))
    CREATE INDEX IX_EmailOtp_Email_Purpose ON dbo.EmailOtp(Email,Purpose,CreatedAt DESC);
GO

/* 6. Thu hồi token khi đổi mật khẩu: lưu thời điểm đổi (UTC) */
IF COL_LENGTH(N'dbo.NguoiDung', N'PasswordChangedAt') IS NULL
    ALTER TABLE dbo.NguoiDung ADD PasswordChangedAt DATETIME2 NULL;
GO

/* 7. Bỏ đơn hàng: đánh giá không còn gắn với MaDonHang (giữ nguyên các đánh giá cũ) */
IF OBJECT_ID(N'dbo.DanhGia', N'U') IS NOT NULL
BEGIN
    DECLARE @drop NVARCHAR(MAX) = N'';
    SELECT @drop += N'ALTER TABLE dbo.DanhGia DROP CONSTRAINT ' + QUOTENAME(name) + N';' FROM sys.foreign_keys
      WHERE parent_object_id = OBJECT_ID(N'dbo.DanhGia') AND referenced_object_id = OBJECT_ID(N'dbo.DonHang');
    IF LEN(@drop) > 0 EXEC sp_executesql @drop;
    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.DanhGia') AND name = N'MaDonHang' AND is_nullable = 0
    )
        ALTER TABLE dbo.DanhGia ALTER COLUMN MaDonHang INT NULL;
END
GO
IF OBJECT_ID(N'dbo.DanhGia', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DanhGia_User_SanPham' AND object_id = OBJECT_ID(N'dbo.DanhGia'))
    CREATE UNIQUE INDEX UX_DanhGia_User_SanPham ON dbo.DanhGia(MaNguoiMua, MaSanPham);
GO
