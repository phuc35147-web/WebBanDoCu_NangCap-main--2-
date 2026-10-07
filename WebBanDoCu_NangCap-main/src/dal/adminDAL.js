const { poolPromise, sql } = require('./dbConfig');
class AdminDAL {
    async findByEmail(email) {
        const p = await poolPromise;
        return (
            await p
                .request()
                .input('email', sql.VarChar(255), email.toLowerCase())
                .query(
                    `SELECT MaNguoiDung AdminUserId,Email,MatKhau PasswordHash,HoTen DisplayName,TrangThai IsActive,TotpSecret,TotpEnabled FROM NguoiDung WHERE Email=@email AND VaiTro='admin'`,
                )
        ).recordset[0];
    }
    async getHomepageContent() {
        const p = await poolPromise;
        return (await p.request().query('SELECT TOP 1 * FROM HomepageContent WHERE ContentId=1')).recordset[0] || null;
    }
    async saveHomepageContent(d) {
        const p = await poolPromise;
        await p
            .request()
            .input('title', sql.NVarChar(255), d.heroTitle)
            .input('sub', sql.NVarChar(255), d.heroSubtitle)
            .input('desc', sql.NVarChar(1000), d.heroDescription)
            .input('img', sql.VarChar(1000), d.heroImageUrl)
            .query(
                `UPDATE HomepageContent SET HeroTitle=@title,HeroSubtitle=@sub,HeroDescription=@desc,HeroImageUrl=@img,UpdatedAt=SYSDATETIME() WHERE ContentId=1`,
            );
        return this.getHomepageContent();
    }
    async stats() {
        const p = await poolPromise;
        const r = await p
            .request()
            .query(
                `SELECT (SELECT COUNT(*) FROM NguoiDung WHERE VaiTro<>'admin') Users,(SELECT COUNT(*) FROM SanPhamDoCu) Products,(SELECT COUNT(*) FROM SanPhamDoCu WHERE TrangThai=N'Đang bán') ActiveProducts`,
            );
        return r.recordset[0];
    }
    async dashboard() {
        const p = await poolPromise;
        const r = await p.request().query(`
            SELECT
                (SELECT COUNT(*) FROM NguoiDung WHERE VaiTro<>'admin') Users,
                (SELECT COUNT(*) FROM SanPhamDoCu) Products,
                (SELECT COUNT(*) FROM SanPhamDoCu WHERE TrangThai=N'Đang bán') ActiveProducts,
                (SELECT COUNT(*) FROM SanPhamDoCu WHERE TrangThai=N'Chờ duyệt') PendingProducts,
                (SELECT COUNT(*) FROM SanPhamDoCu WHERE TrangThai=N'Ẩn') HiddenProducts;
            WITH Days AS (
                SELECT CONVERT(date,DATEADD(DAY,-v.n,SYSDATETIME())) Day
                FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13)) v(n)
            )
            SELECT CONVERT(varchar(10),d.Day,23) Day,COUNT(sp.MaSanPham) Products
            FROM Days d
            LEFT JOIN SanPhamDoCu sp ON sp.NgayDang>=d.Day AND sp.NgayDang<DATEADD(DAY,1,d.Day)
            GROUP BY d.Day
            ORDER BY d.Day;
        `);
        const trend = r.recordsets[1].map((row) => ({ date: String(row.Day).slice(0, 10), products: row.Products }));
        return { metrics: r.recordsets[0][0], trend };
    }
    async bulkModerateProducts(ids, action, status, reason, adminEmail) {
        const p = await poolPromise;
        const tx = new sql.Transaction(p);
        await tx.begin();
        try {
            const request = tx.request();
            ids.forEach((id, index) => request.input(`id${index}`, sql.Int, id));
            const idList = ids.map((_, index) => `@id${index}`).join(',');
            const selected = await request.query(
                `SELECT MaSanPham,TenSanPham,HinhAnh FROM SanPhamDoCu WITH (UPDLOCK,HOLDLOCK) WHERE MaSanPham IN (${idList})`,
            );
            if (selected.recordset.length !== ids.length) throw Error('Một hoặc nhiều tin đăng không tồn tại.');
            let imagePaths = [];

            if (action === 'delete') {
                const imageRequest = tx.request();
                ids.forEach((id, index) => imageRequest.input(`id${index}`, sql.Int, id));
                imagePaths = (
                    await imageRequest.query(`
                        SELECT HinhAnh AS DuongDan FROM SanPhamDoCu WHERE MaSanPham IN (${idList}) AND HinhAnh IS NOT NULL
                        UNION
                        SELECT DuongDan FROM SanPhamHinhAnh WHERE MaSanPham IN (${idList})
                    `)
                ).recordset.map((row) => row.DuongDan);
                // Tin đã có tin nhắn: xóa mềm để giữ ngữ cảnh chat; tin chưa có tin nhắn: xóa hẳn. Đánh giá đã gắn với người bán nên không còn chặn xóa.
                const softRequest = tx.request();
                ids.forEach((id, index) => softRequest.input(`id${index}`, sql.Int, id));
                await softRequest.query(
                    `UPDATE SanPhamDoCu SET TrangThai=N'Đã xóa',NgayCapNhat=SYSDATETIME() WHERE MaSanPham IN (${idList}) AND EXISTS(SELECT 1 FROM TinNhan WHERE TinNhan.MaSanPham=SanPhamDoCu.MaSanPham)`,
                );
                const delRequest = tx.request();
                ids.forEach((id, index) => delRequest.input(`id${index}`, sql.Int, id));
                await delRequest.query(
                    `DELETE FROM SanPhamDoCu WHERE MaSanPham IN (${idList}) AND NOT EXISTS(SELECT 1 FROM TinNhan WHERE TinNhan.MaSanPham=SanPhamDoCu.MaSanPham)`,
                );
            } else {
                const updateRequest = tx
                    .request()
                    .input('status', sql.NVarChar(30), status)
                    .input('reason', sql.NVarChar(1000), status === 'Từ chối' ? reason : null);
                ids.forEach((id, index) => updateRequest.input(`id${index}`, sql.Int, id));
                const updated = await updateRequest.query(
                    `UPDATE SanPhamDoCu SET TrangThai=@status,LyDoTuChoi=@reason,NgayCapNhat=SYSDATETIME() WHERE MaSanPham IN (${idList})`,
                );
                if (updated.rowsAffected[0] !== ids.length) throw Error('Không thể cập nhật đầy đủ tin đăng đã chọn.');
            }

            for (const product of selected.recordset) {
                await tx
                    .request()
                    .input('email', sql.VarChar(255), String(adminEmail || 'unknown').slice(0, 255))
                    .input(
                        'action',
                        sql.NVarChar(255),
                        `Quản trị ${action === 'delete' ? 'xóa' : 'cập nhật trạng thái'} tin đăng`,
                    )
                    .input('targetId', sql.Int, product.MaSanPham)
                    .input(
                        'content',
                        sql.NVarChar(1000),
                        action === 'delete'
                            ? 'Xóa tin đăng hàng loạt.'
                            : `Trạng thái: ${status}${status === 'Từ chối' ? `; lý do: ${reason}` : ''}`.slice(0, 1000),
                    )
                    .query(
                        `INSERT AdminLog(AdminEmail,HanhDong,DoiTuong,MaDoiTuong,NoiDung)
                         VALUES(@email,@action,N'SanPhamDoCu',@targetId,@content)`,
                    );
            }
            await tx.commit();
            if (action === 'delete') {
                const sanPhamDAL = require('./sanPhamDAL');
                for (const product of selected.recordset) {
                    if (product.HinhAnh) imagePaths.push(product.HinhAnh);
                }
                for (const imagePath of new Set(imagePaths)) {
                    await sanPhamDAL.removeUnusedImage(imagePath);
                }
            }
            return { affected: ids.length };
        } catch (e) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error('Không thể hoàn tác giao dịch kiểm duyệt hàng loạt:', rollbackError);
            }
            throw e;
        }
    }
    async getReports() {
        const p = await poolPromise;
        return (
            await p
                .request()
                .query(
                    `SELECT bc.MaBaoCao,bc.MaSanPham,bc.MaNguoiBaoCao,bc.LoaiViPham,bc.ChiTiet,bc.TrangThai,bc.NgayBaoCao,sp.TenSanPham,sp.TrangThai TrangThaiSanPham,nd.HoTen TenNguoiBao,nd.Email EmailNguoiBao FROM BaoCaoSanPham bc JOIN SanPhamDoCu sp ON sp.MaSanPham=bc.MaSanPham JOIN NguoiDung nd ON nd.MaNguoiDung=bc.MaNguoiBaoCao ORDER BY CASE WHEN bc.TrangThai=N'Chờ xử lý' THEN 0 ELSE 1 END,bc.NgayBaoCao DESC`,
                )
        ).recordset;
    }
    async updateReport(id, status, hideProduct) {
        const p = await poolPromise;
        const tx = new sql.Transaction(p);
        await tx.begin();
        try {
            const r = await tx
                .request()
                .input('id', sql.Int, id)
                .input('status', sql.NVarChar(30), status)
                .query(
                    `UPDATE BaoCaoSanPham SET TrangThai=@status,NgayXuLy=SYSDATETIME() WHERE MaBaoCao=@id; SELECT MaSanPham FROM BaoCaoSanPham WHERE MaBaoCao=@id`,
                );
            if (!r.recordset[0]) throw Error('Không tìm thấy báo cáo.');
            if (hideProduct)
                await tx
                    .request()
                    .input('pid', sql.Int, r.recordset[0].MaSanPham)
                    .query(
                        `UPDATE SanPhamDoCu SET TrangThai=N'Ẩn',NgayCapNhat=SYSDATETIME() WHERE MaSanPham=@pid; INSERT ThongBao(MaNguoiDung,TieuDe,NoiDung) SELECT MaNguoiBan,N'Tin đăng đã bị ẩn',LEFT(N'Tin "'+TenSanPham+N'" đã bị ẩn do bị báo cáo vi phạm.',1000) FROM SanPhamDoCu WHERE MaSanPham=@pid`,
                    );
            await tx.commit();
        } catch (e) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error('Không thể hoàn tác giao dịch xử lý báo cáo:', rollbackError);
            }
            throw e;
        }
    }
    async findById(id) {
        const p = await poolPromise;
        return (
            await p
                .request()
                .input('id', sql.Int, id)
                .query(
                    `SELECT MaNguoiDung AdminUserId,Email,MatKhau PasswordHash,TrangThai IsActive,TotpSecret,TotpEnabled FROM NguoiDung WHERE MaNguoiDung=@id AND VaiTro='admin'`,
                )
        ).recordset[0];
    }
    async saveTotp(id, secret, enabled) {
        const p = await poolPromise;
        await p
            .request()
            .input('id', sql.Int, id)
            .input('secret', sql.VarChar(64), secret)
            .input('enabled', sql.Bit, enabled)
            .query(`UPDATE NguoiDung SET TotpSecret=@secret,TotpEnabled=@enabled WHERE MaNguoiDung=@id AND VaiTro='admin'`);
    }
}
module.exports = new AdminDAL();
