USE WebBanDoCu;
GO

IF COL_LENGTH(N'dbo.SanPhamDoCu', N'LyDoTuChoi') IS NULL
    ALTER TABLE dbo.SanPhamDoCu ADD LyDoTuChoi NVARCHAR(1000) NULL;
GO

UPDATE dbo.SanPhamDoCu
SET TinhTrang = CASE
    WHEN TinhTrang IN (N'Còn như mới', N'Mới', N'Mới 99%') THEN N'Mới 99%'
    WHEN TinhTrang IN (N'Đã sử dụng tốt', N'Đã qua sử dụng (còn tốt)') THEN N'Đã qua sử dụng (còn tốt)'
    WHEN TinhTrang IN (N'Cần sửa chữa', N'Hỏng nhẹ / Cần sửa chữa') THEN N'Hỏng nhẹ / Cần sửa chữa'
    ELSE N'Cũ / Có trầy xước'
END
WHERE TinhTrang NOT IN (
    N'Mới 99%', N'Đã qua sử dụng (còn tốt)',
    N'Cũ / Có trầy xước', N'Hỏng nhẹ / Cần sửa chữa'
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_SanPham_TinhTrang')
    ALTER TABLE dbo.SanPhamDoCu WITH CHECK ADD CONSTRAINT CK_SanPham_TinhTrang
    CHECK (TinhTrang IN (N'Mới 99%',N'Đã qua sử dụng (còn tốt)',N'Cũ / Có trầy xước',N'Hỏng nhẹ / Cần sửa chữa'));
GO

IF OBJECT_ID(N'dbo.BaoCaoSanPham',N'U') IS NULL
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_BaoCao_Open_User_Product' AND object_id=OBJECT_ID(N'dbo.BaoCaoSanPham'))
    CREATE UNIQUE INDEX UX_BaoCao_Open_User_Product ON dbo.BaoCaoSanPham(MaSanPham,MaNguoiBaoCao) WHERE TrangThai=N'Chờ xử lý';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_BaoCao_Status_Date' AND object_id=OBJECT_ID(N'dbo.BaoCaoSanPham'))
    CREATE INDEX IX_BaoCao_Status_Date ON dbo.BaoCaoSanPham(TrangThai,NgayBaoCao DESC);
GO
