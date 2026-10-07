/*
 * MIGRATION + SEED
 * - Chạy tự động khi AUTO_MIGRATE=true (mặc định bật ở dev, TẮT ở production).
 * - Production: chạy `npm run migrate` bằng tài khoản DB có quyền DDL (DB_MIGRATE_USER / DB_MIGRATE_PASSWORD),
 *   còn ứng dụng chạy bằng tài khoản DB chỉ có quyền đọc/ghi dữ liệu.
 * - Mọi câu lệnh đều idempotent (chạy lại nhiều lần không sao).
 */
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { adminPasswordProblems } = require('../config/startupChecks');

const CREATE_TIN_NHAN = `
    IF OBJECT_ID(N'dbo.TinNhan',N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TinNhan(
        MaTinNhan INT IDENTITY(1,1) PRIMARY KEY,
        MaNguoiGui INT NOT NULL,
        MaNguoiNhan INT NOT NULL,
        MaSanPham INT NULL,
        NoiDung NVARCHAR(2000) NOT NULL,
        DaDoc BIT NOT NULL DEFAULT 0,
        NgayGui DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_TinNhan_Gui FOREIGN KEY(MaNguoiGui) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE NO ACTION,
        CONSTRAINT FK_TinNhan_Nhan FOREIGN KEY(MaNguoiNhan) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE NO ACTION,
        CONSTRAINT FK_TinNhan_SP FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE SET NULL
      );
      CREATE INDEX IX_TinNhan_Conversation ON dbo.TinNhan(MaNguoiGui,MaNguoiNhan,MaSanPham,NgayGui);
      CREATE INDEX IX_TinNhan_Inbox ON dbo.TinNhan(MaNguoiNhan,DaDoc,NgayGui);
    END
  `;

function buildMigrations() {
    return [
            `IF COL_LENGTH(N'dbo.SanPhamDoCu',N'NgayDayTin') IS NULL ALTER TABLE dbo.SanPhamDoCu ADD NgayDayTin DATETIME2 NULL`,
            /* Thời điểm đổi mật khẩu (UTC): token đăng nhập cấp trước mốc này sẽ bị từ chối */
            `IF COL_LENGTH(N'dbo.NguoiDung',N'PasswordChangedAt') IS NULL ALTER TABLE dbo.NguoiDung ADD PasswordChangedAt DATETIME2 NULL`,
            `IF COL_LENGTH(N'dbo.NguoiDung',N'DaXacMinh') IS NULL ALTER TABLE dbo.NguoiDung ADD DaXacMinh BIT NOT NULL CONSTRAINT DF_NguoiDung_DaXacMinh DEFAULT 0 WITH VALUES`,
            `IF COL_LENGTH(N'dbo.SanPhamDoCu',N'ViDo') IS NULL ALTER TABLE dbo.SanPhamDoCu ADD ViDo DECIMAL(9,6) NULL`,
            `IF COL_LENGTH(N'dbo.SanPhamDoCu',N'KinhDo') IS NULL ALTER TABLE dbo.SanPhamDoCu ADD KinhDo DECIMAL(9,6) NULL`,
            `IF COL_LENGTH(N'dbo.TinNhan',N'LoaiTinNhan') IS NULL ALTER TABLE dbo.TinNhan ADD LoaiTinNhan VARCHAR(16) NOT NULL CONSTRAINT DF_TinNhan_Loai DEFAULT 'text' WITH VALUES`,
            `IF COL_LENGTH(N'dbo.TinNhan',N'GiaDeXuat') IS NULL ALTER TABLE dbo.TinNhan ADD GiaDeXuat DECIMAL(18,2) NULL`,
            `IF OBJECT_ID(N'dbo.ChanNguoiDung',N'U') IS NULL CREATE TABLE dbo.ChanNguoiDung(
                MaNguoiChan INT NOT NULL, MaNguoiBiChan INT NOT NULL, NgayChan DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                PRIMARY KEY(MaNguoiChan,MaNguoiBiChan),
                CONSTRAINT FK_Chan_User FOREIGN KEY(MaNguoiChan) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
                CONSTRAINT FK_BiChan_User FOREIGN KEY(MaNguoiBiChan) REFERENCES dbo.NguoiDung(MaNguoiDung))`,
            `IF OBJECT_ID(N'dbo.BaoCaoNguoiDung',N'U') IS NULL CREATE TABLE dbo.BaoCaoNguoiDung(
                MaBaoCao INT IDENTITY(1,1) PRIMARY KEY, MaNguoiBiBaoCao INT NOT NULL, MaNguoiBaoCao INT NOT NULL,
                LyDo NVARCHAR(100) NOT NULL, ChiTiet NVARCHAR(1000) NULL,
                TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Chờ xử lý', NgayBaoCao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                CONSTRAINT FK_BaoCaoND_Target FOREIGN KEY(MaNguoiBiBaoCao) REFERENCES dbo.NguoiDung(MaNguoiDung),
                CONSTRAINT FK_BaoCaoND_Reporter FOREIGN KEY(MaNguoiBaoCao) REFERENCES dbo.NguoiDung(MaNguoiDung),
                CONSTRAINT CK_BaoCaoND_Status CHECK(TrangThai IN(N'Chờ xử lý',N'Đã xử lý',N'Bỏ qua')))`,
            `IF OBJECT_ID(N'dbo.TuKhoaCam',N'U') IS NULL CREATE TABLE dbo.TuKhoaCam(
                MaTuKhoa INT IDENTITY(1,1) PRIMARY KEY, TuKhoa NVARCHAR(100) NOT NULL UNIQUE,
                TrangThai BIT NOT NULL DEFAULT 1, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME())`,
            `IF OBJECT_ID(N'dbo.TheoDoiNguoiDung',N'U') IS NULL CREATE TABLE dbo.TheoDoiNguoiDung(
                MaNguoiTheoDoi INT NOT NULL, MaNguoiDuocTheoDoi INT NOT NULL, NgayTheoDoi DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                PRIMARY KEY(MaNguoiTheoDoi,MaNguoiDuocTheoDoi),
                CONSTRAINT FK_TheoDoi_Follower FOREIGN KEY(MaNguoiTheoDoi) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
                CONSTRAINT FK_TheoDoi_Target FOREIGN KEY(MaNguoiDuocTheoDoi) REFERENCES dbo.NguoiDung(MaNguoiDung))`,
            `IF OBJECT_ID(N'dbo.TimKiemLuu',N'U') IS NULL CREATE TABLE dbo.TimKiemLuu(
                MaTimKiem INT IDENTITY(1,1) PRIMARY KEY, MaNguoiDung INT NOT NULL, Ten NVARCHAR(100) NOT NULL,
                BoLoc NVARCHAR(1000) NOT NULL, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                CONSTRAINT FK_TimKiemLuu_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE)`,
            `IF OBJECT_ID(N'dbo.TinDaXem',N'U') IS NULL CREATE TABLE dbo.TinDaXem(
                MaNguoiDung INT NOT NULL, MaSanPham INT NOT NULL, NgayXemGanNhat DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                PRIMARY KEY(MaNguoiDung,MaSanPham),
                CONSTRAINT FK_TinDaXem_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
                CONSTRAINT FK_TinDaXem_Product FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE)`,
            /* Đánh giá không còn gắn với đơn hàng (đã bỏ chức năng đơn hàng); giữ nguyên các đánh giá cũ */
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL
     BEGIN
        DECLARE @drop NVARCHAR(MAX)=N'';
        SELECT @drop+=N'ALTER TABLE dbo.DanhGia DROP CONSTRAINT '+QUOTENAME(name)+N';' FROM sys.foreign_keys
          WHERE parent_object_id=OBJECT_ID(N'dbo.DanhGia') AND referenced_object_id=OBJECT_ID(N'dbo.DonHang');
        IF LEN(@drop)>0 EXEC sp_executesql @drop;
        IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.DanhGia') AND name=N'MaDonHang' AND is_nullable=0)
          ALTER TABLE dbo.DanhGia ALTER COLUMN MaDonHang INT NULL;
     END`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UX_DanhGia_User_SanPham' AND object_id=OBJECT_ID(N'dbo.DanhGia'))
        CREATE UNIQUE INDEX UX_DanhGia_User_SanPham ON dbo.DanhGia(MaNguoiMua,MaSanPham)`,
            `IF OBJECT_ID(N'dbo.YeuThich',N'U') IS NULL CREATE TABLE dbo.YeuThich(
        MaNguoiDung INT NOT NULL, MaSanPham INT NOT NULL, NgayThem DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        PRIMARY KEY(MaNguoiDung,MaSanPham),
        CONSTRAINT FK_YT_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE,
        CONSTRAINT FK_YT_Product FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE CASCADE)`,
            `IF OBJECT_ID(N'dbo.ThongBao',N'U') IS NULL CREATE TABLE dbo.ThongBao(
        MaThongBao INT IDENTITY(1,1) PRIMARY KEY, MaNguoiDung INT NOT NULL, TieuDe NVARCHAR(255) NOT NULL,
        NoiDung NVARCHAR(1000) NOT NULL, DaDoc BIT NOT NULL DEFAULT 0, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_TB_User FOREIGN KEY(MaNguoiDung) REFERENCES dbo.NguoiDung(MaNguoiDung) ON DELETE CASCADE)`,
            `IF OBJECT_ID(N'dbo.AdminLog',N'U') IS NULL CREATE TABLE dbo.AdminLog(
        MaLog BIGINT IDENTITY(1,1) PRIMARY KEY, AdminEmail VARCHAR(255) NOT NULL, HanhDong NVARCHAR(255) NOT NULL,
        DoiTuong NVARCHAR(100) NULL, MaDoiTuong INT NULL, NoiDung NVARCHAR(1000) NULL, NgayTao DATETIME2 NOT NULL DEFAULT SYSDATETIME())`,
            `IF OBJECT_ID(N'dbo.EmailOtp',N'U') IS NULL CREATE TABLE dbo.EmailOtp(
        OtpId INT IDENTITY(1,1) PRIMARY KEY, Email VARCHAR(255) NOT NULL, Purpose VARCHAR(24) NOT NULL,
        CodeHash CHAR(64) NOT NULL, ExpiresAt DATETIME2 NOT NULL, Attempts TINYINT NOT NULL DEFAULT 0,
        VerifiedAt DATETIME2 NULL, ConsumedAt DATETIME2 NULL, CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT CK_EmailOtp_Purpose CHECK(Purpose IN('register','reset-password')))`,
            `IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_EmailOtp_Email_Purpose' AND object_id=OBJECT_ID(N'dbo.EmailOtp'))
        CREATE INDEX IX_EmailOtp_Email_Purpose ON dbo.EmailOtp(Email,Purpose,CreatedAt DESC)`,
            `IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_ThongBao_User' AND object_id=OBJECT_ID(N'dbo.ThongBao'))
        CREATE INDEX IX_ThongBao_User ON dbo.ThongBao(MaNguoiDung,DaDoc,NgayTao DESC)`,
            `IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_YeuThich_SanPham' AND object_id=OBJECT_ID(N'dbo.YeuThich'))
        CREATE INDEX IX_YeuThich_SanPham ON dbo.YeuThich(MaSanPham)`,
            /* Constraint cũ viết 'Từ chối' không có tiền tố N => có thể bị sai mã ký tự. Tạo lại đúng. */
            `IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_SanPham_Status' AND parent_object_id=OBJECT_ID(N'dbo.SanPhamDoCu')
               AND definition NOT LIKE N'%N''Từ chối''%')
     BEGIN
        ALTER TABLE dbo.SanPhamDoCu DROP CONSTRAINT CK_SanPham_Status;
        ALTER TABLE dbo.SanPhamDoCu ADD CONSTRAINT CK_SanPham_Status
          CHECK(TrangThai IN(N'Chờ duyệt',N'Đang bán',N'Đã bán',N'Ẩn',N'Từ chối'));
     END`,

            /* ===== Bổ sung đợt hoàn thiện ===== */
            /* 2FA (TOTP) cho tài khoản quản trị */
            `IF COL_LENGTH(N'dbo.NguoiDung',N'TotpSecret') IS NULL ALTER TABLE dbo.NguoiDung ADD TotpSecret VARCHAR(64) NULL`,
            `IF COL_LENGTH(N'dbo.NguoiDung',N'TotpEnabled') IS NULL ALTER TABLE dbo.NguoiDung ADD TotpEnabled BIT NOT NULL CONSTRAINT DF_NguoiDung_TotpEnabled DEFAULT 0 WITH VALUES`,
            /* Đồng ý điều khoản khi đăng ký */
            `IF COL_LENGTH(N'dbo.NguoiDung',N'NgayDongYDieuKhoan') IS NULL ALTER TABLE dbo.NguoiDung ADD NgayDongYDieuKhoan DATETIME2 NULL`,
            /* Người mua thật của tin (người bán chọn khi bấm "Đã bán") — chỉ người này mới được đánh giá */
            `IF COL_LENGTH(N'dbo.SanPhamDoCu',N'MaNguoiMua') IS NULL ALTER TABLE dbo.SanPhamDoCu ADD MaNguoiMua INT NULL`,
            `IF COL_LENGTH(N'dbo.SanPhamDoCu',N'MaNguoiMua') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_SanPham_NguoiMua')
                ALTER TABLE dbo.SanPhamDoCu ADD CONSTRAINT FK_SanPham_NguoiMua FOREIGN KEY(MaNguoiMua) REFERENCES dbo.NguoiDung(MaNguoiDung)`,
            /* Trạng thái 'Đã xóa' (xóa mềm khi tin đã có tin nhắn, để giữ ngữ cảnh cuộc trò chuyện) */
            `IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_SanPham_Status' AND parent_object_id=OBJECT_ID(N'dbo.SanPhamDoCu')
               AND definition NOT LIKE N'%N''Đã xóa''%')
     BEGIN
        ALTER TABLE dbo.SanPhamDoCu DROP CONSTRAINT CK_SanPham_Status;
        ALTER TABLE dbo.SanPhamDoCu ADD CONSTRAINT CK_SanPham_Status
          CHECK(TrangThai IN(N'Chờ duyệt',N'Đang bán',N'Đã bán',N'Ẩn',N'Từ chối',N'Đã xóa'));
     END`,
            /* Đánh giá gắn với NGƯỜI BÁN: xóa tin không còn làm mất / chặn đánh giá */
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.DanhGia',N'MaNguoiBan') IS NULL
                ALTER TABLE dbo.DanhGia ADD MaNguoiBan INT NULL`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.DanhGia',N'MaNguoiBan') IS NOT NULL
                UPDATE dg SET MaNguoiBan=sp.MaNguoiBan FROM dbo.DanhGia dg JOIN dbo.SanPhamDoCu sp ON sp.MaSanPham=dg.MaSanPham WHERE dg.MaNguoiBan IS NULL`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.DanhGia',N'MaNguoiBan') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_DG_Seller')
                ALTER TABLE dbo.DanhGia ADD CONSTRAINT FK_DG_Seller FOREIGN KEY(MaNguoiBan) REFERENCES dbo.NguoiDung(MaNguoiDung)`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.DanhGia') AND name=N'MaSanPham' AND is_nullable=0)
     BEGIN
        DECLARE @drop NVARCHAR(MAX)=N'';
        SELECT @drop+=N'ALTER TABLE dbo.DanhGia DROP CONSTRAINT '+QUOTENAME(fk.name)+N';' FROM sys.foreign_keys fk
          WHERE fk.parent_object_id=OBJECT_ID(N'dbo.DanhGia') AND fk.referenced_object_id=OBJECT_ID(N'dbo.SanPhamDoCu');
        IF LEN(@drop)>0 EXEC sp_executesql @drop;
        IF EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UX_DanhGia_User_SanPham' AND object_id=OBJECT_ID(N'dbo.DanhGia'))
          DROP INDEX UX_DanhGia_User_SanPham ON dbo.DanhGia;
        ALTER TABLE dbo.DanhGia ALTER COLUMN MaSanPham INT NULL;
        ALTER TABLE dbo.DanhGia ADD CONSTRAINT FK_DG_SP FOREIGN KEY(MaSanPham) REFERENCES dbo.SanPhamDoCu(MaSanPham) ON DELETE SET NULL;
     END`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'UX_DanhGia_User_SanPham' AND object_id=OBJECT_ID(N'dbo.DanhGia'))
                CREATE UNIQUE INDEX UX_DanhGia_User_SanPham ON dbo.DanhGia(MaNguoiMua,MaSanPham) WHERE MaSanPham IS NOT NULL`,
            `IF OBJECT_ID(N'dbo.DanhGia',N'U') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_DanhGia_NguoiBan' AND object_id=OBJECT_ID(N'dbo.DanhGia'))
                CREATE INDEX IX_DanhGia_NguoiBan ON dbo.DanhGia(MaNguoiBan,NgayDanhGia DESC)`,
            /* Chỉ mục cho tải lịch sử chat và kiểm tra quyền xem ảnh chat */
            `IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name=N'IX_TinNhan_Reverse' AND object_id=OBJECT_ID(N'dbo.TinNhan'))
                CREATE INDEX IX_TinNhan_Reverse ON dbo.TinNhan(MaNguoiNhan,MaNguoiGui,MaSanPham,NgayGui)`,
        ];
}

async function runSchemaMigrations(pool) {
    await pool.request().query(CREATE_TIN_NHAN);
    const migrations = buildMigrations();
    for (let i = 0; i < migrations.length; i++) {
        try {
            await pool.request().query(migrations[i]);
        } catch (error) {
            throw new Error(`Migration cơ sở dữ liệu số ${i + 1}/${migrations.length} thất bại.`, { cause: error });
        }
    }
}

async function runSeeds(pool) {
        const seedDemo = String(process.env.SEED_DEMO || 'false').toLowerCase() === 'true';
        const demoEmail = 'demo.seller@example.com';
        let u = await pool
            .request()
            .input('email', sql.VarChar(255), demoEmail)
            .query('SELECT MaNguoiDung FROM NguoiDung WHERE Email=@email');
        let sellerId;
        if (!u.recordset.length && seedDemo) {
            const hash = await bcrypt.hash('123456', 10);
            const r = await pool
                .request()
                .input('hoTen', sql.NVarChar(150), 'Người bán Demo')
                .input('email', sql.VarChar(255), demoEmail)
                .input('phone', sql.VarChar(20), '0900000001')
                .input('pass', sql.VarChar(255), hash)
                .query(
                    "INSERT NguoiDung(HoTen,Email,SoDienThoai,MatKhau,VaiTro,TinhThanh,PhuongXa,DiaChiChiTiet) OUTPUT INSERTED.MaNguoiDung VALUES(@hoTen,@email,@phone,@pass,'user',N'TP. Hồ Chí Minh',N'Phường Bến Nghé',N'Địa chỉ demo')",
                );
            sellerId = r.recordset[0].MaNguoiDung;
        } else if (u.recordset.length) sellerId = u.recordset[0].MaNguoiDung;
        const cat = await pool.request().query('SELECT TOP 9 MaDanhMuc FROM DanhMuc ORDER BY MaDanhMuc');
        const count = await pool.request().query('SELECT COUNT(*) total FROM SanPhamDoCu');
        if (Number(count.recordset[0].total) === 0 && sellerId && cat.recordset.length) {
            const products = [
                [
                    'iPhone 13 Pro 128GB',
                    'Máy đẹp, đầy đủ chức năng, pin ổn.',
                    12500000,
                    'Đã qua sử dụng (còn tốt)',
                    'TP. Hồ Chí Minh',
                ],
                [
                    'MacBook Air M1 2020',
                    'Phù hợp học tập và văn phòng.',
                    14500000,
                    'Đã qua sử dụng (còn tốt)',
                    'TP. Hồ Chí Minh',
                ],
                [
                    'Tai nghe Sony WH-1000XM4',
                    'Chống ồn tốt, hoạt động ổn định.',
                    4200000,
                    'Cũ / Có trầy xước',
                    'Đà Nẵng',
                ],
                [
                    'Xe máy Honda Vision 2021',
                    'Xe bảo dưỡng định kỳ, giấy tờ đầy đủ.',
                    26500000,
                    'Đã qua sử dụng (còn tốt)',
                    'TP. Hồ Chí Minh',
                ],
                ['Bàn học gỗ', 'Bàn chắc chắn, còn đẹp.', 850000, 'Cũ / Có trầy xước', 'Hà Nội'],
                ['Sách Java cơ bản', 'Sách phù hợp sinh viên CNTT.', 120000, 'Mới 99%', 'TP. Hồ Chí Minh'],
            ];
            for (let i = 0; i < products.length; i++) {
                const p = products[i];
                await pool
                    .request()
                    .input('seller', sql.Int, sellerId)
                    .input('cat', sql.Int, cat.recordset[i % cat.recordset.length].MaDanhMuc)
                    .input('name', sql.NVarChar(255), p[0])
                    .input('desc', sql.NVarChar(sql.MAX), p[1])
                    .input('price', sql.Decimal(18, 2), p[2])
                    .input('condition', sql.NVarChar(100), p[3])
                    .input('address', sql.NVarChar(500), p[4])
                    .input(
                        'image',
                        sql.VarChar(1000),
                        i % 2 ? '/uploads/1789292864980-923735277.jpg' : '/uploads/1789292862629-134554614.jpg',
                    )
                    .query(
                        "INSERT SanPhamDoCu(MaNguoiBan,MaDanhMuc,TenSanPham,MoTa,GiaBan,TinhTrang,SoLuong,DiaChiXemHang,HinhAnh,TrangThai) VALUES(@seller,@cat,@name,@desc,@price,@condition,1,@address,@image,N'Đang bán')",
                    );
            }
        }
        const imageRows = await pool
            .request()
            .query(
                `SELECT sp.MaSanPham,sp.HinhAnh FROM SanPhamDoCu sp LEFT JOIN SanPhamHinhAnh ha ON ha.MaSanPham=sp.MaSanPham WHERE ha.MaHinhAnh IS NULL AND sp.HinhAnh IS NOT NULL`,
            );
        for (const row of imageRows.recordset) {
            await pool
                .request()
                .input('sp', sql.Int, row.MaSanPham)
                .input('path', sql.VarChar(1000), row.HinhAnh)
                .query(`INSERT SanPhamHinhAnh(MaSanPham,DuongDan,LaAnhChinh,ThuTu) VALUES(@sp,@path,1,1)`);
        }
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            const problems = adminPasswordProblems(process.env.ADMIN_PASSWORD);
            if (problems.length) {
                console.warn(
                    `⚠️  Bỏ qua việc tạo tài khoản admin vì ADMIN_PASSWORD không đạt yêu cầu (${problems.join('; ')}).`,
                );
                return;
            }
            const email = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
            const exists = await pool
                .request()
                .input('email', sql.VarChar(255), email)
                .query('SELECT MaNguoiDung FROM NguoiDung WHERE Email=@email');
            if (!exists.recordset.length) {
                const hash = await bcrypt.hash(String(process.env.ADMIN_PASSWORD), 12);
                await pool
                    .request()
                    .input('name', sql.NVarChar(150), process.env.ADMIN_NAME || 'Quản trị viên')
                    .input('email', sql.VarChar(255), email)
                    .input('phone', sql.VarChar(20), process.env.ADMIN_PHONE || '0900000099')
                    .input('pass', sql.VarChar(255), hash)
                    .query(
                        "INSERT NguoiDung(HoTen,Email,SoDienThoai,MatKhau,VaiTro) VALUES(@name,@email,@phone,@pass,'admin')",
                    );
            }
        }
}

async function runMigrations(pool) {
    await runSchemaMigrations(pool);
    await runSeeds(pool);
}

module.exports = { runMigrations, runSchemaMigrations, runSeeds };
