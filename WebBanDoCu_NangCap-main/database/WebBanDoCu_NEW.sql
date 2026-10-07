/* =========================================================
   CHỢ ĐỒ CŨ - DATABASE SQL SERVER HOÀN TOÀN MỚI
   Version 2.0 - thiết kế lại, không phụ thuộc DB cũ
   ========================================================= */
USE master;
GO
/* An toàn: chỉ TẠO database nếu chưa có, KHÔNG xóa dữ liệu.
   Muốn xóa sạch để làm lại (chỉ cho máy dev) hãy chạy riêng database/RESET_DEV_DATABASE.sql. */
IF DB_ID(N'WebBanDoCu') IS NULL
    CREATE DATABASE WebBanDoCu;
GO
USE WebBanDoCu;
GO

CREATE TABLE dbo.NguoiDung(
    MaNguoiDung INT IDENTITY(1,1) PRIMARY KEY,
    HoTen NVARCHAR(150) NOT NULL,
    Email VARCHAR(255) NOT NULL UNIQUE,
    SoDienThoai VARCHAR(20) NOT NULL UNIQUE,
    MatKhau VARCHAR(255) NOT NULL,
    VaiTro VARCHAR(20) NOT NULL DEFAULT 'user',
    TrangThai BIT NOT NULL DEFAULT 1,
    TinhThanh NVARCHAR(100) NULL,
    QuanHuyen NVARCHAR(100) NULL,
    PhuongXa NVARCHAR(100) NULL,
    DiaChiChiTiet NVARCHAR(255) NULL,
    AnhDaiDien VARCHAR(500) NULL,
    NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayCapNhat DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    PasswordChangedAt DATETIME2 NULL, /* token đăng nhập cấp trước mốc này (UTC) bị từ chối */
    CONSTRAINT CK_NguoiDung_VaiTro CHECK(VaiTro IN ('user','admin'))
);
GO
CREATE INDEX IX_NguoiDung_VaiTro ON dbo.NguoiDung(VaiTro);
GO

CREATE TABLE dbo.DanhMuc(
    MaDanhMuc INT IDENTITY(1,1) PRIMARY KEY,
    TenDanhMuc NVARCHAR(100) NOT NULL UNIQUE,
    MoTa NVARCHAR(500) NULL,
    HinhAnh VARCHAR(500) NULL,
    TrangThai BIT NOT NULL DEFAULT 1,
    NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.SanPhamDoCu(
    MaSanPham INT IDENTITY(1,1) PRIMARY KEY,
    MaNguoiBan INT NOT NULL,
    MaDanhMuc INT NOT NULL,
    TenSanPham NVARCHAR(255) NOT NULL,
    MoTa NVARCHAR(MAX) NULL,
    GiaBan DECIMAL(18,2) NOT NULL,
    TinhTrang NVARCHAR(100) NOT NULL,
    SoLuong INT NOT NULL DEFAULT 1,
    DiaChiXemHang NVARCHAR(500) NULL,
    HinhAnh VARCHAR(1000) NULL,
    TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Chờ duyệt',
    LyDoTuChoi NVARCHAR(1000) NULL,
    LuotXem INT NOT NULL DEFAULT 0,
    LuotYeuThich INT NOT NULL DEFAULT 0,
    NgayDang DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayDayTin DATETIME2 NULL,
    NgayCapNhat DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_SanPham_NguoiBan FOREIGN KEY(MaNguoiBan) REFERENCES dbo.NguoiDung(MaNguoiDung),
    CONSTRAINT FK_SanPham_DanhMuc FOREIGN KEY(MaDanhMuc) REFERENCES dbo.DanhMuc(MaDanhMuc),
    CONSTRAINT CK_SanPham_Gia CHECK(GiaBan > 0),
    CONSTRAINT CK_SanPham_SoLuong CHECK(SoLuong >= 0),
    CONSTRAINT CK_SanPham_Status CHECK(TrangThai IN(N'Chờ duyệt',N'Đang bán',N'Đã bán',N'Ẩn',N'Từ chối')),
    CONSTRAINT CK_SanPham_TinhTrang CHECK(TinhTrang IN(N'Mới 99%',N'Đã qua sử dụng (còn tốt)',N'Cũ / Có trầy xước',N'Hỏng nhẹ / Cần sửa chữa'))
);
GO
CREATE INDEX IX_SanPham_DanhMuc_Status ON dbo.SanPhamDoCu(MaDanhMuc,TrangThai);
CREATE INDEX IX_SanPham_NguoiBan ON dbo.SanPhamDoCu(MaNguoiBan);
CREATE INDEX IX_SanPham_NgayDang ON dbo.SanPhamDoCu(NgayDang DESC);
CREATE INDEX IX_SanPham_Ten ON dbo.SanPhamDoCu(TenSanPham);
GO

/* Mọi tài khoản đang hoạt động đều được đăng tin. Admin chỉ duyệt trạng thái tin đăng. */
CREATE OR ALTER TRIGGER dbo.TR_SanPhamDoCu_CheckSeller
ON dbo.SanPhamDoCu
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        LEFT JOIN dbo.NguoiDung nd ON nd.MaNguoiDung=i.MaNguoiBan
        WHERE nd.MaNguoiDung IS NULL OR nd.TrangThai=0
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50002, N'Tài khoản không tồn tại hoặc đang bị khóa, không thể đăng tin.', 1;
    END
END;
GO

CREATE TABLE dbo.SanPhamHinhAnh(
    MaHinhAnh INT IDENTITY(1,1) PRIMARY KEY,
    MaSanPham INT NOT NULL,
    DuongDan VARCHAR(1000) NOT NULL,
    LaAnhChinh BIT NOT NULL DEFAULT 0,
    ThuTu INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_HinhAnh_SanPham FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.YeuThich(
    MaNguoiDung INT NOT NULL,
    MaSanPham INT NOT NULL,
    NgayThem DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    PRIMARY KEY(MaNguoiDung,MaSanPham),
    CONSTRAINT FK_YT_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
    CONSTRAINT FK_YT_Product FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.DanhGia(
    MaDanhGia INT IDENTITY(1,1) PRIMARY KEY,
    MaNguoiMua INT NOT NULL,
    MaSanPham INT NOT NULL,
    SoSao TINYINT NOT NULL,
    NoiDung NVARCHAR(1000) NULL,
    NgayDanhGia DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_DG_User FOREIGN KEY(MaNguoiMua) REFERENCES dbo.NguoiDung(MaNguoiDung),
    CONSTRAINT FK_DG_SP FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham),
    CONSTRAINT CK_DG_Sao CHECK(SoSao BETWEEN 1 AND 5)
);
GO
/* Mỗi người chỉ đánh giá một lần cho mỗi tin; điều kiện "hai bên đã nhắn tin với nhau" được kiểm tra ở server */
CREATE UNIQUE INDEX UX_DanhGia_User_SanPham ON dbo.DanhGia(MaNguoiMua,MaSanPham);
GO

CREATE TABLE dbo.BaoCaoSanPham(
    MaBaoCao INT IDENTITY(1,1) PRIMARY KEY,
    MaSanPham INT NOT NULL,
    MaNguoiBaoCao INT NOT NULL,
    LoaiViPham NVARCHAR(100) NOT NULL,
    ChiTiet NVARCHAR(1000) NULL,
    TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Chờ xử lý',
    NgayBaoCao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayXuLy DATETIME2 NULL,
    CONSTRAINT FK_BaoCao_SP FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE,
    CONSTRAINT FK_BaoCao_User FOREIGN KEY(MaNguoiBaoCao) REFERENCES dbo.NguoiDung(MaNguoiDung),
    CONSTRAINT CK_BaoCao_Status CHECK(TrangThai IN(N'Chờ xử lý',N'Đã xử lý',N'Bỏ qua'))
);
GO
CREATE UNIQUE INDEX UX_BaoCao_Open_User_Product ON dbo.BaoCaoSanPham(MaSanPham,MaNguoiBaoCao) WHERE TrangThai=N'Chờ xử lý';
CREATE INDEX IX_BaoCao_Status_Date ON dbo.BaoCaoSanPham(TrangThai,NgayBaoCao DESC);
GO

CREATE TABLE dbo.ThongBao(
    MaThongBao INT IDENTITY(1,1) PRIMARY KEY,
    MaNguoiDung INT NOT NULL,
    TieuDe NVARCHAR(255) NOT NULL,
    NoiDung NVARCHAR(1000) NOT NULL,
    DaDoc BIT NOT NULL DEFAULT 0,
    NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_TB_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.HomepageContent(
    ContentId INT PRIMARY KEY,
    HeroTitle NVARCHAR(255), HeroSubtitle NVARCHAR(255), HeroDescription NVARCHAR(1000),
    HeroImageUrl VARCHAR(1000), UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
CREATE TABLE dbo.TinNhan(
    MaTinNhan INT IDENTITY(1,1) PRIMARY KEY,
    MaNguoiGui INT NOT NULL,
    MaNguoiNhan INT NOT NULL,
    MaSanPham INT NULL,
    NoiDung NVARCHAR(2000) NOT NULL,
    DaDoc BIT NOT NULL DEFAULT 0,
    NgayGui DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_TinNhan_Gui FOREIGN KEY(MaNguoiGui) REFERENCES dbo.NguoiDung(MaNguoiDung),
    CONSTRAINT FK_TinNhan_Nhan FOREIGN KEY(MaNguoiNhan) REFERENCES dbo.NguoiDung(MaNguoiDung),
    CONSTRAINT FK_TinNhan_SP FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE SET NULL
);
GO
CREATE INDEX IX_TinNhan_Conversation ON dbo.TinNhan(MaNguoiGui,MaNguoiNhan,MaSanPham,NgayGui);
CREATE INDEX IX_TinNhan_Inbox ON dbo.TinNhan(MaNguoiNhan,DaDoc,NgayGui);
CREATE INDEX IX_TinNhan_ChatLookup ON dbo.TinNhan(MaNguoiNhan,MaNguoiGui,MaSanPham,NgayGui);
GO

CREATE TABLE dbo.AdminLog(
    MaLog BIGINT IDENTITY(1,1) PRIMARY KEY,
    AdminEmail VARCHAR(255) NOT NULL,
    HanhDong NVARCHAR(255) NOT NULL,
    DoiTuong NVARCHAR(100) NULL,
    MaDoiTuong INT NULL,
    NoiDung NVARCHAR(1000) NULL,
    NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
CREATE TABLE dbo.EmailOtp(
    OtpId INT IDENTITY(1,1) PRIMARY KEY,
    Email VARCHAR(255) NOT NULL,
    Purpose VARCHAR(24) NOT NULL,
    CodeHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    Attempts TINYINT NOT NULL DEFAULT 0,
    VerifiedAt DATETIME2 NULL,
    ConsumedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_EmailOtp_Purpose CHECK(Purpose IN('register','reset-password'))
);
GO
CREATE INDEX IX_EmailOtp_Email_Purpose ON dbo.EmailOtp(Email,Purpose,CreatedAt DESC);
GO

INSERT dbo.DanhMuc(TenDanhMuc,MoTa) VALUES
(N'Điện thoại',N'iPhone, Samsung, Xiaomi và điện thoại đã qua sử dụng'),
(N'Laptop',N'Laptop học tập, văn phòng, gaming'),
(N'Đồ điện tử',N'Tai nghe, loa, máy ảnh, máy chơi game'),
(N'Đồ gia dụng',N'Tủ lạnh, máy giặt, nồi cơm và đồ gia dụng'),
(N'Thời trang',N'Quần áo, giày dép, túi xách và phụ kiện'),
(N'Xe cộ',N'Xe máy, xe đạp và phụ kiện xe'),
(N'Nội thất',N'Bàn, ghế, tủ và đồ trang trí'),
(N'Sách',N'Sách giáo khoa, truyện, sách chuyên ngành'),
(N'Khác',N'Các mặt hàng đồ cũ khác');
GO
INSERT dbo.HomepageContent(ContentId,HeroTitle,HeroSubtitle,HeroDescription,HeroImageUrl)
VALUES(1,N'Chợ Đồ Cũ',N'Mua bán đồ cũ dễ dàng và an toàn',N'Nền tảng trung gian kết nối người mua và người bán, hỗ trợ đăng tin và trao đổi trực tiếp. Website không trực tiếp mua bán hàng hóa.',N'/uploads/1789292862629-134554614.jpg');
GO

/* View phục vụ web và thống kê */
CREATE VIEW dbo.vw_SanPhamDangBan AS
SELECT sp.MaSanPham,sp.MaNguoiBan,sp.MaDanhMuc,sp.TenSanPham,sp.MoTa,sp.GiaBan,sp.TinhTrang,sp.SoLuong,
       sp.DiaChiXemHang,sp.HinhAnh,sp.LuotXem,sp.LuotYeuThich,sp.NgayDang,
       dm.TenDanhMuc,nd.HoTen AS TenNguoiBan
FROM dbo.SanPhamDoCu sp
JOIN dbo.DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc
JOIN dbo.NguoiDung nd ON nd.MaNguoiDung=sp.MaNguoiBan
WHERE sp.TrangThai=N'Đang bán' AND sp.SoLuong>0 AND nd.TrangThai=1;
GO
PRINT N'Đã tạo CSDL WebBanDoCu hoàn toàn mới thành công.';
PRINT N'Chạy server Node.js để tạo tài khoản demo và dữ liệu sản phẩm mẫu.';
GO
