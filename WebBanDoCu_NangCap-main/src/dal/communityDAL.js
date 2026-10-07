const { poolPromise, sql } = require('./dbConfig');

class CommunityDAL {
    async assertAllowedText(value) {
        const text = String(value || '').trim();
        if (!text) return;
        const pool = await poolPromise;
        const result = await pool.request().input('text', sql.NVarChar(sql.MAX), text).query(`
            SELECT TOP 1 TuKhoa
            FROM TuKhoaCam
            WHERE TrangThai=1 AND CHARINDEX(TuKhoa COLLATE Latin1_General_100_CI_AI, @text COLLATE Latin1_General_100_CI_AI)>0
        `);
        if (result.recordset.length) throw new Error('Nội dung chứa từ khóa không được phép.');
    }

    async assertNotDuplicate(sellerId, categoryId, title, excludedProductId = null) {
        const pool = await poolPromise;
        const result = await pool
            .request()
            .input('seller', sql.Int, sellerId)
            .input('category', sql.Int, categoryId)
            .input('title', sql.NVarChar(255), String(title).trim())
            .input('exclude', sql.Int, excludedProductId).query(`
                SELECT TOP 1 MaSanPham
                FROM SanPhamDoCu
                WHERE MaNguoiBan=@seller AND MaDanhMuc=@category
                  AND MaSanPham<>ISNULL(@exclude,0)
                  AND TrangThai IN(N'Chờ duyệt',N'Đang bán',N'Ẩn')
                  AND TenSanPham COLLATE Latin1_General_100_CI_AI=@title COLLATE Latin1_General_100_CI_AI
            `);
        if (result.recordset.length) throw new Error('Bạn đã có tin trùng tên trong danh mục này.');
    }

    async changeBlock(blockerId, targetId, block) {
        if (blockerId === targetId) throw new Error('Bạn không thể chặn chính mình.');
        const pool = await poolPromise;
        const user = await pool
            .request()
            .input('id', sql.Int, targetId)
            .query(`SELECT MaNguoiDung FROM NguoiDung WHERE MaNguoiDung=@id AND TrangThai=1 AND VaiTro<>'admin'`);
        if (!user.recordset.length) throw new Error('Không tìm thấy người dùng.');
        await pool
            .request()
            .input('from', sql.Int, blockerId)
            .input('to', sql.Int, targetId)
            .query(
                block
                    ? `IF NOT EXISTS(SELECT 1 FROM ChanNguoiDung WHERE MaNguoiChan=@from AND MaNguoiBiChan=@to) INSERT ChanNguoiDung(MaNguoiChan,MaNguoiBiChan) VALUES(@from,@to)`
                    : `DELETE ChanNguoiDung WHERE MaNguoiChan=@from AND MaNguoiBiChan=@to`,
            );
    }

    async blockedUsers(userId) {
        const pool = await poolPromise;
        return (
            await pool.request().input('id', sql.Int, userId).query(`
                SELECT u.MaNguoiDung,u.HoTen,u.AnhDaiDien,b.NgayChan
                FROM ChanNguoiDung b JOIN NguoiDung u ON u.MaNguoiDung=b.MaNguoiBiChan
                WHERE b.MaNguoiChan=@id ORDER BY b.NgayChan DESC
            `)
        ).recordset;
    }

    async reportUser(reporterId, targetId, reason, details) {
        if (reporterId === targetId) throw new Error('Bạn không thể báo cáo chính mình.');
        const pool = await poolPromise;
        const target = await pool
            .request()
            .input('id', sql.Int, targetId)
            .query(`SELECT 1 AS Found FROM NguoiDung WHERE MaNguoiDung=@id AND TrangThai=1 AND VaiTro<>'admin'`);
        if (!target.recordset.length) throw new Error('Không tìm thấy người dùng.');
        const existing = await pool
            .request()
            .input('reporter', sql.Int, reporterId)
            .input('target', sql.Int, targetId)
            .query(
                `SELECT 1 AS Found FROM BaoCaoNguoiDung WHERE MaNguoiBiBaoCao=@target AND MaNguoiBaoCao=@reporter AND TrangThai=N'Chờ xử lý'`,
            );
        if (existing.recordset.length) throw new Error('Bạn đã gửi báo cáo đang chờ xử lý cho người dùng này.');
        const result = await pool
            .request()
            .input('reporter', sql.Int, reporterId)
            .input('target', sql.Int, targetId)
            .input('reason', sql.NVarChar(100), reason)
            .input('details', sql.NVarChar(1000), details || null)
            .query(
                `INSERT BaoCaoNguoiDung(MaNguoiBiBaoCao,MaNguoiBaoCao,LyDo,ChiTiet) VALUES(@target,@reporter,@reason,@details)`,
            );
        return result.rowsAffected[0] > 0;
    }

    async follow(followerId, targetId, follow) {
        if (followerId === targetId) throw new Error('Bạn không thể theo dõi chính mình.');
        const pool = await poolPromise;
        if (follow) {
            const target = await pool
                .request()
                .input('id', sql.Int, targetId)
                .query(`SELECT 1 AS Found FROM NguoiDung WHERE MaNguoiDung=@id AND TrangThai=1 AND VaiTro<>'admin'`);
            if (!target.recordset.length) throw new Error('Không tìm thấy hồ sơ người bán.');
        }
        await pool
            .request()
            .input('follower', sql.Int, followerId)
            .input('target', sql.Int, targetId)
            .query(
                follow
                    ? `IF NOT EXISTS(SELECT 1 FROM TheoDoiNguoiDung WHERE MaNguoiTheoDoi=@follower AND MaNguoiDuocTheoDoi=@target)
                         INSERT TheoDoiNguoiDung(MaNguoiTheoDoi,MaNguoiDuocTheoDoi) VALUES(@follower,@target)`
                    : `DELETE TheoDoiNguoiDung WHERE MaNguoiTheoDoi=@follower AND MaNguoiDuocTheoDoi=@target`,
            );
    }

    async followStatus(followerId, targetId) {
        const pool = await poolPromise;
        const result = await pool.request().input('follower', sql.Int, followerId).input('target', sql.Int, targetId)
            .query(`
                SELECT
                    CAST(CASE WHEN EXISTS(
                        SELECT 1 FROM TheoDoiNguoiDung
                        WHERE MaNguoiTheoDoi=@follower AND MaNguoiDuocTheoDoi=@target
                    ) THEN 1 ELSE 0 END AS BIT) AS Following,
                    (SELECT COUNT(*) FROM TheoDoiNguoiDung WHERE MaNguoiDuocTheoDoi=@target) AS FollowerCount
            `);
        return {
            following: Boolean(result.recordset[0]?.Following),
            followerCount: Number(result.recordset[0]?.FollowerCount || 0),
        };
    }

    async setVerified(userId, verified) {
        const pool = await poolPromise;
        const result = await pool
            .request()
            .input('id', sql.Int, userId)
            .input('verified', sql.Bit, verified)
            .query(`UPDATE NguoiDung SET DaXacMinh=@verified WHERE MaNguoiDung=@id AND VaiTro<>'admin'`);
        if (!result.rowsAffected[0]) throw new Error('Không tìm thấy người dùng.');
    }

    async listUserReports() {
        const pool = await poolPromise;
        return (
            await pool.request().query(`
                SELECT TOP 500 r.*,target.HoTen AS TenNguoiBiBaoCao,reporter.HoTen AS TenNguoiBaoCao,
                       reporter.Email AS EmailNguoiBaoCao
                FROM BaoCaoNguoiDung r
                JOIN NguoiDung target ON target.MaNguoiDung=r.MaNguoiBiBaoCao
                JOIN NguoiDung reporter ON reporter.MaNguoiDung=r.MaNguoiBaoCao
                ORDER BY CASE WHEN r.TrangThai=N'Chờ xử lý' THEN 0 ELSE 1 END,r.NgayBaoCao DESC
            `)
        ).recordset;
    }

    async resolveUserReport(id, status) {
        const pool = await poolPromise;
        const result = await pool
            .request()
            .input('id', sql.Int, id)
            .input('status', sql.NVarChar(30), status)
            .query(`UPDATE BaoCaoNguoiDung SET TrangThai=@status WHERE MaBaoCao=@id`);
        if (!result.rowsAffected[0]) throw new Error('Không tìm thấy báo cáo người dùng.');
    }

    async listKeywords() {
        const pool = await poolPromise;
        return (await pool.request().query('SELECT * FROM TuKhoaCam ORDER BY TuKhoa')).recordset;
    }

    async addKeyword(keyword) {
        const pool = await poolPromise;
        await pool
            .request()
            .input('word', sql.NVarChar(100), keyword)
            .query(`IF NOT EXISTS(SELECT 1 FROM TuKhoaCam WHERE TuKhoa=@word) INSERT TuKhoaCam(TuKhoa) VALUES(@word)`);
    }

    async removeKeyword(id) {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, id).query('DELETE TuKhoaCam WHERE MaTuKhoa=@id');
    }

    async suggestions(query) {
        const pool = await poolPromise;
        const escaped = String(query).replace(/[[%_]/g, (character) => `[${character}]`);
        return (
            await pool.request().input('query', sql.NVarChar(255), `${escaped}%`).query(`
                SELECT TOP 8 TenSanPham
                FROM SanPhamDoCu
                WHERE TrangThai=N'Đang bán' AND TenSanPham LIKE @query
                GROUP BY TenSanPham ORDER BY COUNT(*) DESC,TenSanPham
            `)
        ).recordset.map((row) => row.TenSanPham);
    }

    async saveSearch(userId, name, filters) {
        const pool = await poolPromise;
        await pool
            .request()
            .input('user', sql.Int, userId)
            .input('name', sql.NVarChar(100), name)
            .input('filters', sql.NVarChar(1000), JSON.stringify(filters))
            .query('INSERT TimKiemLuu(MaNguoiDung,Ten,BoLoc) VALUES(@user,@name,@filters)');
    }

    async savedSearches(userId) {
        const pool = await poolPromise;
        return (
            await pool
                .request()
                .input('user', sql.Int, userId)
                .query(
                    'SELECT MaTimKiem,Ten,BoLoc,NgayTao FROM TimKiemLuu WHERE MaNguoiDung=@user ORDER BY NgayTao DESC',
                )
        ).recordset.map((row) => ({ ...row, BoLoc: JSON.parse(row.BoLoc) }));
    }

    async deleteSavedSearch(userId, id) {
        const pool = await poolPromise;
        await pool
            .request()
            .input('user', sql.Int, userId)
            .input('id', sql.Int, id)
            .query('DELETE TimKiemLuu WHERE MaTimKiem=@id AND MaNguoiDung=@user');
    }

    async recordView(userId, productId) {
        const pool = await poolPromise;
        const product = await pool
            .request()
            .input('id', sql.Int, productId)
            .query(`SELECT 1 AS Found FROM SanPhamDoCu WHERE MaSanPham=@id AND TrangThai IN(N'Đang bán',N'Đã bán')`);
        if (!product.recordset.length) throw new Error('Không tìm thấy tin đăng.');
        const result = await pool.request().input('user', sql.Int, userId).input('product', sql.Int, productId).query(`
                MERGE TinDaXem AS target
                USING(SELECT @user AS MaNguoiDung,@product AS MaSanPham) AS source
                ON target.MaNguoiDung=source.MaNguoiDung AND target.MaSanPham=source.MaSanPham
                WHEN MATCHED THEN UPDATE SET NgayXemGanNhat=SYSDATETIME()
                WHEN NOT MATCHED THEN INSERT(MaNguoiDung,MaSanPham) VALUES(source.MaNguoiDung,source.MaSanPham);
            `);
        return result.rowsAffected[0] > 0;
    }

    async recentlyViewed(userId) {
        const pool = await poolPromise;
        return (
            await pool.request().input('user', sql.Int, userId).query(`
                SELECT TOP 50 sp.MaSanPham,sp.TenSanPham,sp.GiaBan,sp.HinhAnh,sp.TinhTrang,
                       sp.DiaChiXemHang,v.NgayXemGanNhat
                FROM TinDaXem v JOIN SanPhamDoCu sp ON sp.MaSanPham=v.MaSanPham
                WHERE v.MaNguoiDung=@user AND sp.TrangThai IN(N'Đang bán',N'Đã bán')
                ORDER BY v.NgayXemGanNhat DESC
            `)
        ).recordset;
    }
}

module.exports = new CommunityDAL();
