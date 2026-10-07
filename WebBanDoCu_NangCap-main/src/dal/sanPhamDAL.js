const { poolPromise, sql } = require('./dbConfig');
const fs = require('fs');
const path = require('path');
class SanPhamDAL {
    async getAll(f = {}) {
        const p = await poolPromise;
        const paged = f.page !== undefined || f.limit !== undefined;
        const limit = Math.min(Math.max(parseInt(f.limit, 10) || 24, 1), 100);
        const page = Math.max(parseInt(f.page, 10) || 1, 1);
        const likeEsc = (v) => String(v).replace(/[[%_]/g, (c) => `[${c}]`);
        let q = `SELECT sp.*,dm.TenDanhMuc,nd.HoTen TenNguoiBan${paged ? ',COUNT(*) OVER() AS TotalCount' : ''} FROM SanPhamDoCu sp JOIN DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc JOIN NguoiDung nd ON nd.MaNguoiDung=sp.MaNguoiBan WHERE sp.TrangThai=N'Đang bán' AND sp.SoLuong>0 AND nd.TrangThai=1`;
        const r = p.request();
        if (f.keyword && String(f.keyword).trim()) {
            /* Tìm không phân biệt dấu tiếng Việt: "dien thoai" khớp "điện thoại" */
            const plain = String(f.keyword).trim().replace(/đ/g, 'd').replace(/Đ/g, 'D');
            q += ` AND(REPLACE(sp.TenSanPham COLLATE Latin1_General_100_CI_AI,N'đ',N'd') LIKE @kw OR REPLACE(CAST(sp.MoTa AS NVARCHAR(MAX)) COLLATE Latin1_General_100_CI_AI,N'đ',N'd') LIKE @kw)`;
            r.input('kw', sql.NVarChar, `%${likeEsc(plain)}%`);
        }
        if (f.maDanhMuc) {
            q += ' AND sp.MaDanhMuc=@cat';
            r.input('cat', sql.Int, Number(f.maDanhMuc));
        }
        if (f.tinhTrang) {
            q += ' AND sp.TinhTrang=@cond';
            r.input('cond', sql.NVarChar, f.tinhTrang);
        }
        if (f.location) {
            q += ' AND sp.DiaChiXemHang LIKE @loc';
            r.input('loc', sql.NVarChar, `%${likeEsc(f.location)}%`);
        }
        if (f.minPrice !== undefined && f.minPrice !== '') {
            q += ' AND sp.GiaBan>=@minPrice';
            r.input('minPrice', sql.Decimal(18, 2), Number(f.minPrice));
        }
        if (f.maxPrice !== undefined && f.maxPrice !== '') {
            q += ' AND sp.GiaBan<=@maxPrice';
            r.input('maxPrice', sql.Decimal(18, 2), Number(f.maxPrice));
        }
        /* "Đẩy tin" cập nhật NgayDayTin nên tin vừa đẩy được xếp lên đầu mục mới nhất */
        const sorts = {
            newest: 'COALESCE(sp.NgayDayTin,sp.NgayDang) DESC',
            'price-asc': 'sp.GiaBan ASC',
            'price-desc': 'sp.GiaBan DESC',
        };
        if (f.sort === 'near' && Number.isFinite(f.latitude) && Number.isFinite(f.longitude)) {
            const distance = `6371*ACOS(CASE
                WHEN COS(RADIANS(@latitude))*COS(RADIANS(sp.ViDo))*COS(RADIANS(sp.KinhDo)-RADIANS(@longitude))+SIN(RADIANS(@latitude))*SIN(RADIANS(sp.ViDo))>1 THEN 1
                WHEN COS(RADIANS(@latitude))*COS(RADIANS(sp.ViDo))*COS(RADIANS(sp.KinhDo)-RADIANS(@longitude))+SIN(RADIANS(@latitude))*SIN(RADIANS(sp.ViDo))<-1 THEN -1
                ELSE COS(RADIANS(@latitude))*COS(RADIANS(sp.ViDo))*COS(RADIANS(sp.KinhDo)-RADIANS(@longitude))+SIN(RADIANS(@latitude))*SIN(RADIANS(sp.ViDo))
            END)`;
            q = q.replace('FROM SanPhamDoCu sp', `,${distance} AS DistanceKm FROM SanPhamDoCu sp`);
            q += ` ORDER BY CASE WHEN sp.ViDo IS NULL OR sp.KinhDo IS NULL THEN 1 ELSE 0 END,${distance},sp.MaSanPham DESC`;
            r.input('latitude', sql.Decimal(9, 6), f.latitude).input('longitude', sql.Decimal(9, 6), f.longitude);
        } else {
            q += ` ORDER BY ${sorts[f.sort] || sorts.newest},sp.MaSanPham DESC`;
        }
        if (paged) {
            q += ' OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY';
            r.input('off', sql.Int, (page - 1) * limit);
            r.input('lim', sql.Int, limit);
        }
        return (await r.query(q)).recordset;
    }
    async getById(id, viewer = {}) {
        const p = await poolPromise;

        /* Chỉ tin Đang bán / Đã bán mới công khai. Tin chờ duyệt, bị ẩn, bị từ chối chỉ chủ tin và admin xem được. */
        const head = (
            await p
                .request()
                .input('id', sql.Int, id)
                .query('SELECT MaNguoiBan, TrangThai FROM SanPhamDoCu WHERE MaSanPham=@id')
        ).recordset[0];
        if (!head) return null;
        if (head.TrangThai === 'Đã xóa' && !viewer.isAdmin) return null;
        const isOwner = !!viewer.userId && Number(viewer.userId) === Number(head.MaNguoiBan);
        const isPublic = head.TrangThai === 'Đang bán' || head.TrangThai === 'Đã bán';
        if (!isPublic && !isOwner && !viewer.isAdmin) return null;
        const countView =
            isPublic && !isOwner && !viewer.isAdmin && (!viewer.shouldCount || viewer.shouldCount()) ? 1 : 0;

        const r = await p.request().input('id', sql.Int, id).input('countView', sql.Int, countView).query(`
            UPDATE SanPhamDoCu
            SET LuotXem = LuotXem + 1
            WHERE MaSanPham = @id AND @countView = 1;

            SELECT
                sp.*,
                dm.TenDanhMuc,
                nd.HoTen AS TenNguoiBan,
                CASE WHEN nd.SoDienThoai IS NULL OR LEN(nd.SoDienThoai)=0 THEN NULL WHEN LEN(nd.SoDienThoai)>6 THEN LEFT(nd.SoDienThoai,3)+N'••••'+RIGHT(nd.SoDienThoai,3) ELSE N'••••••' END AS SdtNguoiBanAn,
                nd.AnhDaiDien AS AnhNguoiBan,
                rating.SoSaoTrungBinh,
                rating.TongDanhGia
            FROM SanPhamDoCu sp
            JOIN DanhMuc dm
                ON dm.MaDanhMuc = sp.MaDanhMuc
            JOIN NguoiDung nd
                ON nd.MaNguoiDung = sp.MaNguoiBan
            OUTER APPLY (
                SELECT CAST(AVG(CAST(dg.SoSao AS DECIMAL(4,2))) AS DECIMAL(4,2)) SoSaoTrungBinh,
                       COUNT(*) TongDanhGia
                FROM DanhGia dg
                WHERE dg.MaNguoiBan=sp.MaNguoiBan
            ) rating
            WHERE sp.MaSanPham = @id;

            SELECT
                MaHinhAnh,
                DuongDan,
                LaAnhChinh,
                ThuTu
            FROM SanPhamHinhAnh
            WHERE MaSanPham = @id
            ORDER BY
                LaAnhChinh DESC,
                ThuTu,
                MaHinhAnh;

            SELECT TOP 20 dg.SoSao,dg.NoiDung,dg.NgayDanhGia,nd.HoTen TenNguoiMua
            FROM DanhGia dg
            JOIN NguoiDung nd ON nd.MaNguoiDung=dg.MaNguoiMua
            WHERE dg.MaNguoiBan=(SELECT MaNguoiBan FROM SanPhamDoCu WHERE MaSanPham=@id)
            ORDER BY dg.NgayDanhGia DESC;
        `);

        // SELECT sản phẩm
        const product = r.recordsets[0]?.[0] || null;

        if (!product) {
            return null;
        }

        // SELECT danh sách hình ảnh
        product.HinhAnhs = (r.recordsets[1] || []).map((x) => x.DuongDan);
        product.DanhGiaNguoiBan = r.recordsets[2] || [];

        return product;
    }
    async create(d) {
        const p = await poolPromise;
        const main = d.hinhAnh;
        const out = (
            await p
                .request()
                .input('seller', sql.Int, d.maNguoiBan)
                .input('cat', sql.Int, d.maDanhMuc)
                .input('name', sql.NVarChar(255), String(d.tenSanPham).trim())
                .input('desc', sql.NVarChar(sql.MAX), String(d.moTa).trim())
                .input('price', sql.Decimal(18, 2), Number(d.giaBan))
                .input('cond', sql.NVarChar(100), String(d.tinhTrang).trim())
                .input('qty', sql.Int, Math.max(1, Number(d.soLuong || 1)))
                .input('address', sql.NVarChar(500), String(d.diaChiXemHang).trim())
                .input('latitude', sql.Decimal(9, 6), d.latitude ?? null)
                .input('longitude', sql.Decimal(9, 6), d.longitude ?? null)
                .input('image', sql.VarChar(1000), main)
                .query(
                    `INSERT SanPhamDoCu(MaNguoiBan,MaDanhMuc,TenSanPham,MoTa,GiaBan,TinhTrang,SoLuong,DiaChiXemHang,ViDo,KinhDo,HinhAnh,TrangThai) VALUES(@seller,@cat,@name,@desc,@price,@cond,@qty,@address,@latitude,@longitude,@image,N'Chờ duyệt'); SELECT * FROM SanPhamDoCu WHERE MaSanPham=CONVERT(int,SCOPE_IDENTITY())`,
                )
        ).recordset[0];
        const images = d.hinhAnhs || [];
        for (let i = 0; i < images.length; i++) {
            await p
                .request()
                .input('sp', sql.Int, out.MaSanPham)
                .input('path', sql.VarChar(1000), `/uploads/${images[i].filename}`)
                .input('main', sql.Bit, i === 0 ? 1 : 0)
                .input('order', sql.Int, i + 1)
                .query(`INSERT SanPhamHinhAnh(MaSanPham,DuongDan,LaAnhChinh,ThuTu) VALUES(@sp,@path,@main,@order)`);
        }
        if (main && !images.length) {
            await p
                .request()
                .input('sp', sql.Int, out.MaSanPham)
                .input('path', sql.VarChar(1000), main)
                .query(`INSERT SanPhamHinhAnh(MaSanPham,DuongDan,LaAnhChinh,ThuTu) VALUES(@sp,@path,1,1)`);
        }
        return out;
    }
    /*
     * Sửa tin của chính mình.
     * - keep (tùy chọn): danh sách ảnh cũ muốn giữ, theo thứ tự mới; ảnh không có trong danh sách sẽ bị xóa.
     *   Không truyền keep => giữ nguyên toàn bộ ảnh cũ.
     * - Ảnh chính luôn đồng bộ giữa SanPhamDoCu.HinhAnh và SanPhamHinhAnh (ảnh đầu tiên).
     * - File ảnh không còn được dùng sẽ bị xóa khỏi ổ đĩa.
     */
    async updateOwned(id, seller, d, files, keep) {
        const p = await poolPromise;
        const uploadedMain = (files?.hinhAnh || [])[0] || null;
        const uploadedMore = files?.hinhAnhs || [];
        const newPaths = [
            ...(uploadedMain ? [`/uploads/${uploadedMain.filename}`] : []),
            ...uploadedMore.map((f) => `/uploads/${f.filename}`),
        ];
        const tx = new sql.Transaction(p);
        await tx.begin();
        let out;
        let removed = [];
        try {
            const owned = (
                await tx
                    .request()
                    .input('id', sql.Int, id)
                    .input('seller', sql.Int, seller)
                    .query(
                        `SELECT MaSanPham,TrangThai FROM SanPhamDoCu WITH (UPDLOCK) WHERE MaSanPham=@id AND MaNguoiBan=@seller`,
                    )
            ).recordset[0];
            if (!owned || owned.TrangThai === 'Đã xóa') throw Error('Không tìm thấy tin đăng hoặc bạn không có quyền sửa.');

            const existing = (
                await tx
                    .request()
                    .input('id', sql.Int, id)
                    .query(`SELECT DuongDan FROM SanPhamHinhAnh WHERE MaSanPham=@id ORDER BY LaAnhChinh DESC,ThuTu,MaHinhAnh`)
            ).recordset.map((x) => x.DuongDan);

            const kept = Array.isArray(keep) ? keep.filter((x, i) => existing.includes(x) && keep.indexOf(x) === i) : existing;
            // Ảnh chính tải lên mới (nếu có) được đưa lên đầu
            const finalImages = uploadedMain
                ? [newPaths[0], ...kept, ...newPaths.slice(1)]
                : [...kept, ...newPaths];
            if (!finalImages.length) throw Error('Tin đăng phải có ít nhất 1 ảnh.');
            if (finalImages.length > 8) throw Error('Mỗi tin tối đa 8 ảnh.');
            removed = existing.filter((x) => !finalImages.includes(x));

            out = (
                await tx
                    .request()
                    .input('id', sql.Int, id)
                    .input('seller', sql.Int, seller)
                    .input('cat', sql.Int, Number(d.maDanhMuc))
                    .input('name', sql.NVarChar(255), String(d.tenSanPham).trim())
                    .input('desc', sql.NVarChar(sql.MAX), String(d.moTa).trim())
                    .input('price', sql.Decimal(18, 2), Number(d.giaBan))
                    .input('cond', sql.NVarChar(100), String(d.tinhTrang).trim())
                    .input('qty', sql.Int, Number(d.soLuong || 1))
                    .input('address', sql.NVarChar(500), String(d.diaChiXemHang).trim())
                    .input('latitude', sql.Decimal(9, 6), d.latitude ?? null)
                    .input('longitude', sql.Decimal(9, 6), d.longitude ?? null)
                    .input('image', sql.VarChar(1000), finalImages[0]).query(`
                        UPDATE SanPhamDoCu SET MaDanhMuc=@cat,TenSanPham=@name,MoTa=@desc,GiaBan=@price,TinhTrang=@cond,SoLuong=@qty,
                            DiaChiXemHang=@address,ViDo=@latitude,KinhDo=@longitude,HinhAnh=@image,
                            TrangThai=N'Chờ duyệt',LyDoTuChoi=NULL,MaNguoiMua=NULL,NgayCapNhat=SYSDATETIME()
                        WHERE MaSanPham=@id AND MaNguoiBan=@seller;
                        SELECT * FROM SanPhamDoCu WHERE MaSanPham=@id AND MaNguoiBan=@seller`)
            ).recordset[0];

            await tx.request().input('id', sql.Int, id).query('DELETE FROM SanPhamHinhAnh WHERE MaSanPham=@id');
            for (let i = 0; i < finalImages.length; i++) {
                await tx
                    .request()
                    .input('sp', sql.Int, id)
                    .input('path', sql.VarChar(1000), finalImages[i])
                    .input('main', sql.Bit, i === 0 ? 1 : 0)
                    .input('order', sql.Int, i + 1)
                    .query(`INSERT SanPhamHinhAnh(MaSanPham,DuongDan,LaAnhChinh,ThuTu) VALUES(@sp,@path,@main,@order)`);
            }
            await tx.commit();
        } catch (error) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error('Rollback sửa tin thất bại:', rollbackError);
            }
            throw error;
        }
        for (const img of removed) await this.removeUnusedImage(img);
        return out;
    }
    /*
     * Xóa tin của chính mình.
     * - Tin đã có tin nhắn: xóa mềm (TrangThai='Đã xóa'), giữ lại ngữ cảnh các cuộc trò chuyện; chỉ xóa ảnh phụ.
     * - Tin chưa có tin nhắn: xóa hẳn. Đánh giá không bị chặn vì đã gắn với người bán (MaSanPham tự về NULL).
     */
    async deleteOwned(id, seller) {
        const p = await poolPromise;
        const row = (
            await p
                .request()
                .input('id', sql.Int, id)
                .input('seller', sql.Int, seller)
                .query(
                    `SELECT sp.HinhAnh,sp.TrangThai,(SELECT COUNT(*) FROM TinNhan WHERE MaSanPham=sp.MaSanPham) AS SoTinNhan
                     FROM SanPhamDoCu sp WHERE sp.MaSanPham=@id AND sp.MaNguoiBan=@seller`,
                )
        ).recordset[0];
        if (!row || row.TrangThai === 'Đã xóa') throw Error('Không tìm thấy tin đăng hoặc bạn không có quyền xóa.');
        const imgs = (
            await p.request().input('id', sql.Int, id).query(`SELECT DuongDan FROM SanPhamHinhAnh WHERE MaSanPham=@id`)
        ).recordset.map((x) => x.DuongDan);

        if (Number(row.SoTinNhan) > 0) {
            await p
                .request()
                .input('id', sql.Int, id)
                .query(
                    `UPDATE SanPhamDoCu SET TrangThai=N'Đã xóa',NgayCapNhat=SYSDATETIME() WHERE MaSanPham=@id;
                     DELETE FROM SanPhamHinhAnh WHERE MaSanPham=@id AND DuongDan<>(SELECT HinhAnh FROM SanPhamDoCu WHERE MaSanPham=@id);
                     DELETE FROM YeuThich WHERE MaSanPham=@id;`,
                );
            for (const img of imgs.filter((x) => x !== row.HinhAnh)) await this.removeUnusedImage(img);
            return true;
        }
        const r = await p
            .request()
            .input('id', sql.Int, id)
            .input('seller', sql.Int, seller)
            .query(`DELETE FROM SanPhamDoCu WHERE MaSanPham=@id AND MaNguoiBan=@seller`);
        if (!r.rowsAffected[0]) throw Error('Không tìm thấy tin đăng hoặc bạn không có quyền xóa.');
        for (const img of new Set([row.HinhAnh, ...imgs].filter(Boolean))) await this.removeUnusedImage(img);
        return true;
    }
    /* Xóa file ảnh khỏi ổ đĩa nếu không còn bản ghi nào dùng tới (tránh rác trong /uploads) */
    async removeUnusedImage(rel) {
        try {
            if (!rel || !String(rel).startsWith('/uploads/')) return;
            const name = path.basename(rel);
            if (name === 'default.jpg' || /^banner/i.test(name)) return;
            const p = await poolPromise;
            const used = (
                await p
                    .request()
                    .input('path', sql.VarChar(1000), rel)
                    .query(
                        `SELECT (SELECT COUNT(*) FROM SanPhamHinhAnh WHERE DuongDan=@path)+(SELECT COUNT(*) FROM SanPhamDoCu WHERE HinhAnh=@path)+(SELECT COUNT(*) FROM HomepageContent WHERE HeroImageUrl=@path) AS n`,
                    )
            ).recordset[0].n;
            if (used > 0) return;
            fs.unlink(path.join(__dirname, '..', '..', 'uploads', name), (error) => {
                if (error && error.code !== 'ENOENT') {
                    console.error(`Không thể xóa ảnh không còn được sử dụng ${rel}:`, error);
                }
            });
        } catch (error) {
            console.error(`Không thể kiểm tra/xóa ảnh không còn được sử dụng ${rel}:`, error);
        }
    }
    async getCategories() {
        const p = await poolPromise;
        return (await p.request().query('SELECT * FROM DanhMuc WHERE TrangThai=1 ORDER BY TenDanhMuc')).recordset;
    }
    async getAllForAdmin() {
        const p = await poolPromise;
        return (
            await p
                .request()
                .query(
                    `SELECT sp.*,dm.TenDanhMuc,nd.HoTen TenNguoiBan,nd.Email EmailNguoiBan FROM SanPhamDoCu sp JOIN DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc JOIN NguoiDung nd ON nd.MaNguoiDung=sp.MaNguoiBan WHERE sp.TrangThai<>N'Đã xóa' ORDER BY sp.NgayDang DESC`,
                )
        ).recordset;
    }
    async updateStatus(id, status, reason = null) {
        const p = await poolPromise;
        const r = await p
            .request()
            .input('id', sql.Int, id)
            .input('st', sql.NVarChar(30), status)
            .input('reason', sql.NVarChar(1000), status === 'Từ chối' ? reason : null)
            .query(
                'UPDATE SanPhamDoCu SET TrangThai=@st,LyDoTuChoi=@reason,NgayCapNhat=SYSDATETIME() WHERE MaSanPham=@id',
            );
        if (!r.rowsAffected[0]) throw Error('Không tìm thấy tin đăng.');
        try {
            const row = (
                await p
                    .request()
                    .input('id', sql.Int, id)
                    .query('SELECT MaNguoiBan,TenSanPham FROM SanPhamDoCu WHERE MaSanPham=@id')
            ).recordset[0];
            const msgs = {
                'Đang bán': [
                    'Tin đăng đã được duyệt',
                    `Tin "${row.TenSanPham}" đã được duyệt và hiển thị trên Chợ Đồ Cũ.`,
                ],
                'Từ chối': [
                    'Tin đăng bị từ chối',
                    `Tin "${row.TenSanPham}" bị từ chối. Lý do: ${String(reason || '').slice(0, 700)}`,
                ],
                Ẩn: ['Tin đăng đã bị ẩn', `Tin "${row.TenSanPham}" đã bị quản trị viên ẩn khỏi trang chủ.`],
            };
            const m = msgs[status];
            if (row && m)
                await p
                    .request()
                    .input('uid', sql.Int, row.MaNguoiBan)
                    .input('t', sql.NVarChar(255), m[0])
                    .input('b', sql.NVarChar(1000), m[1].slice(0, 1000))
                    .query('INSERT ThongBao(MaNguoiDung,TieuDe,NoiDung) VALUES(@uid,@t,@b)');
        } catch (_) {
            /* thông báo lỗi không được làm hỏng thao tác duyệt */
        }
    }
    /*
     * Đánh giá người bán: chỉ người mua THẬT mới được đánh giá — tức là người bán đã bấm "Đã bán" và chọn đúng tài khoản
     * này làm người mua (SanPhamDoCu.MaNguoiMua). Mỗi người chỉ đánh giá một lần cho mỗi tin; không tự đánh giá mình.
     */
    async addReview(productId, userId, rating, comment) {
        const p = await poolPromise;
        const result = await p
            .request()
            .input('pid', sql.Int, productId)
            .input('uid', sql.Int, userId)
            .input('rating', sql.TinyInt, rating)
            .input('comment', sql.NVarChar(1000), comment || null).query(`
   DECLARE @seller INT, @buyer INT, @status NVARCHAR(30);
   SELECT @seller=MaNguoiBan,@buyer=MaNguoiMua,@status=TrangThai FROM SanPhamDoCu WHERE MaSanPham=@pid;
   IF @seller IS NULL THROW 50011,N'Tin đăng không tồn tại.',1;
   IF @seller=@uid THROW 50012,N'Bạn không thể đánh giá tin của chính mình.',1;
   IF EXISTS(SELECT 1 FROM DanhGia WHERE MaNguoiMua=@uid AND MaSanPham=@pid) THROW 50013,N'Bạn đã đánh giá tin này rồi.',1;
   IF @status<>N'Đã bán' OR @buyer IS NULL OR @buyer<>@uid
      THROW 50010,N'Chỉ người đã mua hàng (được người bán xác nhận khi chốt giao dịch) mới có thể đánh giá.',1;
   INSERT DanhGia(MaNguoiMua,MaSanPham,MaNguoiBan,SoSao,NoiDung) VALUES(@uid,@pid,@seller,@rating,@comment);`);
        return result.rowsAffected;
    }
    async createReport(productId, userId, reason, details) {
        const p = await poolPromise;
        const product = (
            await p
                .request()
                .input('pid', sql.Int, productId)
                .query(`SELECT MaNguoiBan FROM SanPhamDoCu WHERE MaSanPham=@pid AND TrangThai=N'Đang bán'`)
        ).recordset[0];
        if (!product) throw Error('Tin đăng không còn hoạt động.');
        if (Number(product.MaNguoiBan) === Number(userId))
            throw Error('Bạn không thể báo cáo tin đăng của chính mình.');
        const existing = await p
            .request()
            .input('pid', sql.Int, productId)
            .input('uid', sql.Int, userId)
            .query(
                `SELECT 1 FROM BaoCaoSanPham WHERE MaSanPham=@pid AND MaNguoiBaoCao=@uid AND TrangThai=N'Chờ xử lý'`,
            );
        if (existing.recordset.length) throw Error('Bạn đã gửi báo cáo cho tin này, vui lòng chờ quản trị viên xử lý.');
        await p
            .request()
            .input('pid', sql.Int, productId)
            .input('uid', sql.Int, userId)
            .input('reason', sql.NVarChar(100), reason)
            .input('details', sql.NVarChar(1000), details || null)
            .query(
                `INSERT BaoCaoSanPham(MaSanPham,MaNguoiBaoCao,LoaiViPham,ChiTiet) VALUES(@pid,@uid,@reason,@details)`,
            );
    }
}
module.exports = new SanPhamDAL();
