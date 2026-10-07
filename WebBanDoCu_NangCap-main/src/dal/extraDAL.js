const { poolPromise, sql } = require('./dbConfig');
const bcrypt = require('bcryptjs');

class ExtraDAL {
    /* ================= YÊU THÍCH / LƯU TIN ================= */
    async syncFavoriteCount(pid) {
        try {
            const p = await poolPromise;
            await p
                .request()
                .input('pid', sql.Int, pid)
                .query(
                    'UPDATE SanPhamDoCu SET LuotYeuThich=(SELECT COUNT(*) FROM YeuThich WHERE MaSanPham=@pid) WHERE MaSanPham=@pid',
                );
        } catch (_) {
            /* đếm lỗi không làm hỏng thao tác lưu */
        }
    }

    async addFavorite(uid, pid) {
        const p = await poolPromise;
        const prod = (
            await p
                .request()
                .input('pid', sql.Int, pid)
                .query('SELECT MaNguoiBan,TrangThai FROM SanPhamDoCu WHERE MaSanPham=@pid')
        ).recordset[0];
        if (!prod || prod.TrangThai !== 'Đang bán') throw Error('Tin đăng không còn hoạt động.');
        if (Number(prod.MaNguoiBan) === Number(uid)) throw Error('Bạn không thể lưu tin của chính mình.');
        try {
            await p
                .request()
                .input('uid', sql.Int, uid)
                .input('pid', sql.Int, pid)
                .query(
                    'IF NOT EXISTS(SELECT 1 FROM YeuThich WHERE MaNguoiDung=@uid AND MaSanPham=@pid) INSERT YeuThich(MaNguoiDung,MaSanPham) VALUES(@uid,@pid)',
                );
        } catch (e) {
            if (!/PRIMARY KEY|duplicate/i.test(e.message)) throw e; // bấm đúp cùng lúc: bỏ qua
        }
        await this.syncFavoriteCount(pid);
    }

    async removeFavorite(uid, pid) {
        const p = await poolPromise;
        await p
            .request()
            .input('uid', sql.Int, uid)
            .input('pid', sql.Int, pid)
            .query('DELETE FROM YeuThich WHERE MaNguoiDung=@uid AND MaSanPham=@pid');
        await this.syncFavoriteCount(pid);
    }

    async favoriteIds(uid) {
        const p = await poolPromise;
        const r = await p
            .request()
            .input('uid', sql.Int, uid)
            .query('SELECT MaSanPham FROM YeuThich WHERE MaNguoiDung=@uid');
        return r.recordset.map((x) => x.MaSanPham);
    }

    async listFavorites(uid) {
        const p = await poolPromise;
        return (
            await p.request().input('uid', sql.Int, uid).query(`
            SELECT sp.MaSanPham,sp.TenSanPham,sp.GiaBan,sp.HinhAnh,sp.TinhTrang,sp.DiaChiXemHang,sp.TrangThai,sp.SoLuong,
                   dm.TenDanhMuc,nd.HoTen TenNguoiBan,yt.NgayThem
            FROM YeuThich yt
            JOIN SanPhamDoCu sp ON sp.MaSanPham=yt.MaSanPham
            JOIN DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc
            JOIN NguoiDung nd ON nd.MaNguoiDung=sp.MaNguoiBan
            WHERE yt.MaNguoiDung=@uid AND sp.TrangThai IN(N'Đang bán',N'Đã bán')
            ORDER BY yt.NgayThem DESC`)
        ).recordset;
    }

    /* ================= THÔNG BÁO ================= */
    async notifications(uid) {
        const p = await poolPromise;
        const r = await p.request().input('uid', sql.Int, uid).query(`
            SELECT TOP 50 MaThongBao,TieuDe,NoiDung,DaDoc,NgayTao FROM ThongBao WHERE MaNguoiDung=@uid ORDER BY NgayTao DESC,MaThongBao DESC;
            SELECT COUNT(*) AS Unread FROM ThongBao WHERE MaNguoiDung=@uid AND DaDoc=0;`);
        return { items: r.recordsets[0] || [], unread: Number(r.recordsets[1]?.[0]?.Unread || 0) };
    }

    async markNotificationsRead(uid, id) {
        const p = await poolPromise;
        const req = p.request().input('uid', sql.Int, uid);
        let q = 'UPDATE ThongBao SET DaDoc=1 WHERE MaNguoiDung=@uid AND DaDoc=0';
        if (id) {
            q += ' AND MaThongBao=@id';
            req.input('id', sql.Int, id);
        }
        await req.query(q);
    }

    /* ================= HỒ SƠ NGƯỜI BÁN CÔNG KHAI ================= */
    async sellerProfile(id) {
        const p = await poolPromise;
        const r = await p.request().input('id', sql.Int, id).query(`
            SELECT MaNguoiDung,HoTen,AnhDaiDien,TinhThanh,NgayTao,DaXacMinh FROM NguoiDung WHERE MaNguoiDung=@id AND TrangThai=1 AND VaiTro<>'admin';
            SELECT
              (SELECT COUNT(*) FROM SanPhamDoCu WHERE MaNguoiBan=@id AND TrangThai=N'Đang bán') AS DangBan,
              (SELECT COUNT(*) FROM SanPhamDoCu WHERE MaNguoiBan=@id AND TrangThai=N'Đã bán') AS DaBan,
              (SELECT CAST(AVG(CAST(dg.SoSao AS DECIMAL(4,2))) AS DECIMAL(4,2)) FROM DanhGia dg WHERE dg.MaNguoiBan=@id) AS SoSaoTrungBinh,
              (SELECT COUNT(*) FROM DanhGia dg WHERE dg.MaNguoiBan=@id) AS TongDanhGia,
              (SELECT COUNT(*) FROM TheoDoiNguoiDung WHERE MaNguoiDuocTheoDoi=@id) AS SoNguoiTheoDoi,
              CAST(
                  100.0 * (
                      SELECT COUNT(*)
                      FROM TinNhan incoming
                      WHERE incoming.MaNguoiNhan=@id
                        AND incoming.NgayGui>=DATEADD(DAY,-90,SYSDATETIME())
                        AND EXISTS(
                            SELECT 1
                            FROM TinNhan reply
                            WHERE reply.MaNguoiGui=@id
                              AND reply.MaNguoiNhan=incoming.MaNguoiGui
                              AND reply.NgayGui>=incoming.NgayGui
                              AND reply.NgayGui<=DATEADD(HOUR,24,incoming.NgayGui)
                        )
                  ) / NULLIF((
                      SELECT COUNT(*)
                      FROM TinNhan incoming
                      WHERE incoming.MaNguoiNhan=@id
                        AND incoming.NgayGui>=DATEADD(DAY,-90,SYSDATETIME())
                  ),0) AS DECIMAL(5,1)
              ) AS TyLePhanHoi;
            SELECT TOP 60 sp.MaSanPham,sp.TenSanPham,sp.GiaBan,sp.HinhAnh,sp.TinhTrang,sp.DiaChiXemHang,sp.NgayDang,dm.TenDanhMuc
            FROM SanPhamDoCu sp JOIN DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc
            WHERE sp.MaNguoiBan=@id AND sp.TrangThai=N'Đang bán' AND sp.SoLuong>0
            ORDER BY COALESCE(sp.NgayDayTin,sp.NgayDang) DESC,sp.MaSanPham DESC;`);
        const user = r.recordsets[0]?.[0];
        if (!user) return null;
        return { ...user, ...(r.recordsets[1]?.[0] || {}), products: r.recordsets[2] || [] };
    }

    /* ================= ĐÁNH DẤU ĐÃ BÁN / ĐẨY TIN ================= */
    /* Những người đã nhắn tin cho người bán về tin này — danh sách để chọn "người mua" khi chốt giao dịch */
    async listBuyerCandidates(productId, sellerId) {
        const p = await poolPromise;
        const r = await p.request().input('pid', sql.Int, productId).input('seller', sql.Int, sellerId).query(`
            SELECT nd.MaNguoiDung,nd.HoTen,nd.AnhDaiDien,MAX(tm.NgayGui) AS LanCuoi
            FROM TinNhan tm JOIN NguoiDung nd ON nd.MaNguoiDung=tm.MaNguoiGui
            JOIN SanPhamDoCu sp ON sp.MaSanPham=tm.MaSanPham
            WHERE tm.MaSanPham=@pid AND tm.MaNguoiNhan=@seller AND sp.MaNguoiBan=@seller AND nd.TrangThai=1
            GROUP BY nd.MaNguoiDung,nd.HoTen,nd.AnhDaiDien ORDER BY MAX(tm.NgayGui) DESC`);
        return r.recordset;
    }

    /*
     * Chốt "Đã bán". buyerId (tùy chọn) là người mua thật trên nền tảng: chỉ người này mới đánh giá được người bán.
     * Không chọn buyerId (bán ngoài nền tảng) => tin vẫn chuyển "Đã bán" nhưng không ai đánh giá được.
     */
    async markSold(id, uid, buyerId = null) {
        const p = await poolPromise;
        if (buyerId !== null) {
            const candidates = await this.listBuyerCandidates(id, uid);
            if (!candidates.some((c) => Number(c.MaNguoiDung) === Number(buyerId)))
                throw Error('Người mua phải là người đã nhắn tin với bạn về tin đăng này.');
        }
        const r = await p
            .request()
            .input('id', sql.Int, id)
            .input('uid', sql.Int, uid)
            .input('buyer', sql.Int, buyerId)
            .query(
                `UPDATE SanPhamDoCu SET TrangThai=N'Đã bán',SoLuong=0,MaNguoiMua=@buyer,NgayCapNhat=SYSDATETIME() WHERE MaSanPham=@id AND MaNguoiBan=@uid AND TrangThai=N'Đang bán'`,
            );
        if (!r.rowsAffected[0]) throw Error('Chỉ có thể đánh dấu "Đã bán" với tin đang hiển thị của bạn.');
        if (buyerId !== null) {
            try {
                const name = (
                    await p.request().input('id', sql.Int, id).query('SELECT TenSanPham FROM SanPhamDoCu WHERE MaSanPham=@id')
                ).recordset[0]?.TenSanPham;
                await p
                    .request()
                    .input('uid', sql.Int, buyerId)
                    .input('t', sql.NVarChar(255), 'Bạn có thể đánh giá người bán')
                    .input('b', sql.NVarChar(1000), `Giao dịch "${String(name || '').slice(0, 200)}" đã hoàn tất. Hãy đánh giá người bán ở trang tin đăng.`)
                    .query('INSERT ThongBao(MaNguoiDung,TieuDe,NoiDung) VALUES(@uid,@t,@b)');
            } catch (error) {
                console.error('Không thể gửi thông báo mời đánh giá:', error);
            }
        }
    }

    async bump(id, uid) {
        const p = await poolPromise;
        /* So sánh giờ ngay trong SQL để tránh lệch múi giờ giữa Node và SQL Server */
        const r = await p
            .request()
            .input('id', sql.Int, id)
            .input('uid', sql.Int, uid)
            .query(
                `UPDATE SanPhamDoCu SET NgayDayTin=SYSDATETIME() WHERE MaSanPham=@id AND MaNguoiBan=@uid AND TrangThai=N'Đang bán' AND DATEDIFF(HOUR,COALESCE(NgayDayTin,NgayDang),SYSDATETIME())>=24`,
            );
        if (r.rowsAffected[0]) return;
        const row = (
            await p
                .request()
                .input('id', sql.Int, id)
                .input('uid', sql.Int, uid)
                .query(
                    `SELECT TrangThai,24-DATEDIFF(HOUR,COALESCE(NgayDayTin,NgayDang),SYSDATETIME()) AS ConLai FROM SanPhamDoCu WHERE MaSanPham=@id AND MaNguoiBan=@uid`,
                )
        ).recordset[0];
        if (!row) throw Error('Không tìm thấy tin đăng hoặc bạn không có quyền.');
        if (row.TrangThai !== 'Đang bán') throw Error('Chỉ đẩy được tin đang hiển thị.');
        throw Error(
            `Mỗi tin chỉ được đẩy 1 lần mỗi 24 giờ. Thử lại sau khoảng ${Math.max(1, Number(row.ConLai))} giờ.`,
        );
    }

    /* ================= ĐỔI MẬT KHẨU ================= */
    async changePassword(uid, oldPass, newPass) {
        const p = await poolPromise;
        const u = (
            await p.request().input('id', sql.Int, uid).query('SELECT MatKhau FROM NguoiDung WHERE MaNguoiDung=@id')
        ).recordset[0];
        if (!u) throw Error('Tài khoản không tồn tại.');
        if (!(await bcrypt.compare(String(oldPass || ''), u.MatKhau)))
            throw Error('Mật khẩu hiện tại không chính xác.');
        const hash = await bcrypt.hash(String(newPass), 12);
        await p
            .request()
            .input('id', sql.Int, uid)
            .input('h', sql.VarChar(255), hash)
            .query(
                'UPDATE NguoiDung SET MatKhau=@h,NgayCapNhat=SYSDATETIME(),PasswordChangedAt=SYSUTCDATETIME() WHERE MaNguoiDung=@id',
            );
    }

    /* ================= SỐ ĐIỆN THOẠI NGƯỜI BÁN (chỉ trả khi đã đăng nhập, có giới hạn tần suất) ================= */
    async sellerPhone(pid) {
        const p = await poolPromise;
        const r = (
            await p
                .request()
                .input('pid', sql.Int, pid)
                .query(
                    `SELECT nd.SoDienThoai FROM SanPhamDoCu sp JOIN NguoiDung nd ON nd.MaNguoiDung=sp.MaNguoiBan
             WHERE sp.MaSanPham=@pid AND sp.TrangThai=N'Đang bán' AND nd.TrangThai=1`,
                )
        ).recordset[0];
        if (!r || !r.SoDienThoai)
            throw Error('Tin đăng không còn hoạt động hoặc người bán chưa cung cấp số điện thoại.');
        return r.SoDienThoai;
    }

    /* ================= ADMIN: NGƯỜI DÙNG + NHẬT KÝ ================= */
    async listUsers(keyword) {
        const p = await poolPromise;
        const req = p.request();
        let q = `SELECT nd.MaNguoiDung,nd.HoTen,nd.Email,nd.SoDienThoai,nd.VaiTro,nd.TrangThai,nd.DaXacMinh,nd.NgayTao,
                        (SELECT COUNT(*) FROM SanPhamDoCu WHERE MaNguoiBan=nd.MaNguoiDung) AS SoTin
                 FROM NguoiDung nd WHERE nd.VaiTro<>'admin'`;
        if (keyword && String(keyword).trim()) {
            q += ' AND (nd.HoTen LIKE @kw OR nd.Email LIKE @kw OR nd.SoDienThoai LIKE @kw)';
            req.input(
                'kw',
                sql.NVarChar,
                `%${String(keyword)
                    .trim()
                    .replace(/[[%_]/g, (c) => `[${c}]`)}%`,
            );
        }
        return (await req.query(q + ' ORDER BY nd.NgayTao DESC')).recordset;
    }

    async setUserActive(id, active) {
        const p = await poolPromise;
        const u = (
            await p.request().input('id', sql.Int, id).query('SELECT VaiTro FROM NguoiDung WHERE MaNguoiDung=@id')
        ).recordset[0];
        if (!u) throw Error('Không tìm thấy người dùng.');
        if (u.VaiTro === 'admin') throw Error('Không thể khóa tài khoản quản trị.');
        await p
            .request()
            .input('id', sql.Int, id)
            .input('a', sql.Bit, active ? 1 : 0)
            .query('UPDATE NguoiDung SET TrangThai=@a,NgayCapNhat=SYSDATETIME() WHERE MaNguoiDung=@id');
    }

    async logAdmin(email, action, target, targetId, content) {
        try {
            const p = await poolPromise;
            await p
                .request()
                .input('email', sql.VarChar(255), String(email || 'unknown').slice(0, 255))
                .input('act', sql.NVarChar(255), String(action).slice(0, 255))
                .input('target', sql.NVarChar(100), target || null)
                .input('tid', sql.Int, Number.isInteger(Number(targetId)) ? Number(targetId) : null)
                .input('content', sql.NVarChar(1000), content ? String(content).slice(0, 1000) : null)
                .query(
                    'INSERT AdminLog(AdminEmail,HanhDong,DoiTuong,MaDoiTuong,NoiDung) VALUES(@email,@act,@target,@tid,@content)',
                );
        } catch (_) {
            /* ghi log lỗi không được làm hỏng thao tác admin */
        }
    }

    async adminLogs() {
        const p = await poolPromise;
        return (await p.request().query('SELECT TOP 200 * FROM AdminLog ORDER BY NgayTao DESC,MaLog DESC')).recordset;
    }
}

module.exports = new ExtraDAL();
