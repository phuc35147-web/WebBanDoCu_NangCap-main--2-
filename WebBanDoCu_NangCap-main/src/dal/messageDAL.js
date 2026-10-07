const { poolPromise, sql } = require('./dbConfig');

class MessageDAL {
    async getConversations(userId) {
        const p = await poolPromise;

        const r = await p.request().input('userId', sql.Int, userId).query(`
                WITH ranked AS (
                    SELECT
                        tm.*,

                        ROW_NUMBER() OVER(
                            PARTITION BY
                                CASE
                                    WHEN tm.MaNguoiGui = @userId
                                    THEN tm.MaNguoiNhan
                                    ELSE tm.MaNguoiGui
                                END,

                                ISNULL(tm.MaSanPham, 0)

                            ORDER BY
                                tm.NgayGui DESC,
                                tm.MaTinNhan DESC
                        ) rn

                    FROM TinNhan tm

                    WHERE
                        (tm.MaNguoiGui = @userId OR tm.MaNguoiNhan = @userId)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM ChanNguoiDung blocked
                        WHERE
                            (blocked.MaNguoiChan = @userId AND blocked.MaNguoiBiChan =
                                CASE WHEN tm.MaNguoiGui = @userId THEN tm.MaNguoiNhan ELSE tm.MaNguoiGui END)
                            OR
                            (blocked.MaNguoiBiChan = @userId AND blocked.MaNguoiChan =
                                CASE WHEN tm.MaNguoiGui = @userId THEN tm.MaNguoiNhan ELSE tm.MaNguoiGui END)
                    )
                ),

                unread AS (
                    SELECT

                        CASE
                            WHEN tm.MaNguoiGui = @userId
                            THEN tm.MaNguoiNhan
                            ELSE tm.MaNguoiGui
                        END AS MaDoiPhuong,

                        ISNULL(tm.MaSanPham, 0)
                            AS MaSanPhamKey,

                        COUNT(*) AS ChuaDoc

                    FROM TinNhan tm

                    WHERE
                        tm.MaNguoiNhan = @userId
                        AND tm.DaDoc = 0

                    GROUP BY

                        CASE
                            WHEN tm.MaNguoiGui = @userId
                            THEN tm.MaNguoiNhan
                            ELSE tm.MaNguoiGui
                        END,

                        ISNULL(tm.MaSanPham, 0)
                )

                SELECT

                    r.MaTinNhan,
                    r.MaSanPham,
                    r.NoiDung,
                    TODATETIMEOFFSET(r.NgayGui, '+07:00') AS NgayGui,
                    r.DaDoc,

                    r.MaNguoiGui,
                    r.MaNguoiNhan,

                    nd.MaNguoiDung AS MaDoiPhuong,
                    nd.HoTen AS TenDoiPhuong,
                    nd.AnhDaiDien AS AnhDoiPhuong,

                    sp.TenSanPham,
                    sp.HinhAnh,
                    sp.GiaBan,

                    ISNULL(u.ChuaDoc, 0) AS ChuaDoc

                FROM ranked r

                JOIN NguoiDung nd
                    ON nd.MaNguoiDung =
                        CASE
                            WHEN r.MaNguoiGui = @userId
                            THEN r.MaNguoiNhan
                            ELSE r.MaNguoiGui
                        END

                LEFT JOIN SanPhamDoCu sp
                    ON sp.MaSanPham = r.MaSanPham

                LEFT JOIN unread u
                    ON u.MaDoiPhuong = nd.MaNguoiDung
                    AND u.MaSanPhamKey =
                        ISNULL(r.MaSanPham, 0)

                WHERE r.rn = 1

                ORDER BY
                    r.NgayGui DESC,
                    r.MaTinNhan DESC
            `);

        return r.recordset;
    }

    async getConversation(userId, otherUserId, productId) {
        const p = await poolPromise;
        const blocked = await p
            .request()
            .input('me', sql.Int, userId)
            .input('other', sql.Int, otherUserId)
            .query(
                'SELECT 1 AS Blocked WHERE EXISTS(SELECT 1 FROM ChanNguoiDung WHERE (MaNguoiChan=@me AND MaNguoiBiChan=@other) OR (MaNguoiChan=@other AND MaNguoiBiChan=@me))',
            );
        if (blocked.recordset.length)
            throw new Error('Không thể xem cuộc trò chuyện do một trong hai tài khoản đã chặn người còn lại.');

        const r = await p
            .request()
            .input('me', sql.Int, userId)
            .input('other', sql.Int, otherUserId)
            .input('product', sql.Int, productId || null).query(`
                SELECT

                    tm.MaTinNhan,
                    tm.MaNguoiGui,
                    tm.MaNguoiNhan,
                    tm.MaSanPham,

                    tm.NoiDung,
                    tm.LoaiTinNhan,
                    tm.GiaDeXuat,
                    tm.DaDoc,
                    TODATETIMEOFFSET(tm.NgayGui, '+07:00') AS NgayGui,

                    sender.HoTen AS TenNguoiGui,
                    sender.AnhDaiDien AS AnhNguoiGui,

                    receiver.HoTen AS TenNguoiNhan,

                    sp.TenSanPham,
                    sp.GiaBan,
                    sp.HinhAnh

                FROM TinNhan tm

                JOIN NguoiDung sender
                    ON sender.MaNguoiDung =
                        tm.MaNguoiGui

                JOIN NguoiDung receiver
                    ON receiver.MaNguoiDung =
                        tm.MaNguoiNhan

                LEFT JOIN SanPhamDoCu sp
                    ON sp.MaSanPham =
                        tm.MaSanPham

                WHERE
                    (
                        (
                        tm.MaNguoiGui = @me
                        AND tm.MaNguoiNhan = @other
                        )

                        OR

                        (
                            tm.MaNguoiGui = @other
                            AND tm.MaNguoiNhan = @me
                        )
                    )

                    AND
                    (
                        (
                            @product IS NULL
                            AND tm.MaSanPham IS NULL
                        )

                        OR

                        tm.MaSanPham = @product
                    )

                ORDER BY
                    tm.NgayGui ASC,
                    tm.MaTinNhan ASC
            `);

        return r.recordset;
    }

    /* Danh sách người đã từng trò chuyện với userId (không tính cặp đã chặn nhau) */
    async getContactIds(userId) {
        const p = await poolPromise;
        const r = await p.request().input('me', sql.Int, userId).query(`
            SELECT DISTINCT CASE WHEN tm.MaNguoiGui=@me THEN tm.MaNguoiNhan ELSE tm.MaNguoiGui END AS Other
            FROM TinNhan tm
            WHERE (tm.MaNguoiGui=@me OR tm.MaNguoiNhan=@me)
              AND NOT EXISTS(
                  SELECT 1 FROM ChanNguoiDung b
                  WHERE (b.MaNguoiChan=@me AND b.MaNguoiBiChan=CASE WHEN tm.MaNguoiGui=@me THEN tm.MaNguoiNhan ELSE tm.MaNguoiGui END)
                     OR (b.MaNguoiBiChan=@me AND b.MaNguoiChan=CASE WHEN tm.MaNguoiGui=@me THEN tm.MaNguoiNhan ELSE tm.MaNguoiGui END)
              )`);
        return r.recordset.map((row) => Number(row.Other));
    }

    /* Hai người đã có hội thoại và không chặn nhau? (dùng cho /presence để không dò được người lạ) */
    async hasOpenConversation(userId, otherId) {
        const p = await poolPromise;
        const r = await p.request().input('me', sql.Int, userId).input('other', sql.Int, otherId).query(`
            SELECT CASE WHEN EXISTS(
                SELECT 1 FROM TinNhan WHERE (MaNguoiGui=@me AND MaNguoiNhan=@other) OR (MaNguoiGui=@other AND MaNguoiNhan=@me)
            ) AND NOT EXISTS(
                SELECT 1 FROM ChanNguoiDung WHERE (MaNguoiChan=@me AND MaNguoiBiChan=@other) OR (MaNguoiChan=@other AND MaNguoiBiChan=@me)
            ) THEN 1 ELSE 0 END AS Ok`);
        return Boolean(r.recordset[0]?.Ok);
    }

    /* Chỉ hai người trong cuộc (và chưa chặn nhau) mới được xem ảnh chat riêng tư */
    async canViewChatImage(userId, publicPath) {
        const p = await poolPromise;
        const r = await p.request().input('me', sql.Int, userId).input('path', sql.NVarChar(2000), publicPath).query(`
            SELECT TOP 1 1 AS Ok FROM TinNhan tm
            WHERE tm.NoiDung=@path AND tm.LoaiTinNhan='image' AND (tm.MaNguoiGui=@me OR tm.MaNguoiNhan=@me)
              AND NOT EXISTS(
                  SELECT 1 FROM ChanNguoiDung b
                  WHERE (b.MaNguoiChan=tm.MaNguoiGui AND b.MaNguoiBiChan=tm.MaNguoiNhan)
                     OR (b.MaNguoiChan=tm.MaNguoiNhan AND b.MaNguoiBiChan=tm.MaNguoiGui)
              )`);
        return r.recordset.length > 0;
    }

    async getProduct(productId) {
        if (!productId) {
            return null;
        }

        const p = await poolPromise;

        const r = await p.request().input('id', sql.Int, productId).query(`
                SELECT TOP 1

                    MaSanPham,
                    TenSanPham,
                    GiaBan,
                    HinhAnh

                FROM SanPhamDoCu

                WHERE MaSanPham = @id
            `);

        return r.recordset[0] || null;
    }

    async send(userId, otherUserId, productId, content, options = {}) {
        const p = await poolPromise;

        const text = String(content || '').trim();
        const type = options.type || 'text';
        const offer = options.offer === undefined || options.offer === null ? null : Number(options.offer);

        if (type === 'text' && !text) {
            throw new Error('Nội dung tin nhắn không được để trống.');
        }

        if (text.length > 2000) {
            throw new Error('Tin nhắn tối đa 2000 ký tự.');
        }
        if (!['text', 'image', 'offer'].includes(type)) throw new Error('Loại tin nhắn không hợp lệ.');
        if (type === 'image' && !/^\/(api\/messages\/files|uploads)\/[\w.-]+$/.test(text))
            throw new Error('Ảnh tin nhắn không hợp lệ.');
        if (type === 'offer') {
            if (!Number.isFinite(offer) || offer <= 0 || offer > 1e12) throw new Error('Giá trả không hợp lệ.');
            if (!productId) throw new Error('Chỉ trả giá được khi đang trao đổi về một tin đăng.');
        }

        /* Người nhận phải tồn tại và còn hoạt động; tin đăng (nếu có) phải thuộc về một trong hai người */
        const target = await p
            .request()
            .input('to', sql.Int, otherUserId)
            .query('SELECT TrangThai FROM NguoiDung WHERE MaNguoiDung=@to');
        if (!target.recordset.length || !target.recordset[0].TrangThai)
            throw new Error('Người nhận không tồn tại hoặc tài khoản đã bị khóa.');
        if (productId) {
            const prod = await p
                .request()
                .input('pid', sql.Int, productId)
                .query('SELECT MaNguoiBan FROM SanPhamDoCu WHERE MaSanPham=@pid');
            if (!prod.recordset.length) throw new Error('Tin đăng không tồn tại.');
            const seller = Number(prod.recordset[0].MaNguoiBan);
            if (seller !== Number(userId) && seller !== Number(otherUserId))
                throw new Error('Tin đăng này không thuộc về cuộc trò chuyện.');
        }

        /* Chống spam hàng loạt: tối đa 30 người lạ (chưa từng trả lời) mỗi 24 giờ */
        const spam = await p.request().input('from', sql.Int, userId).input('to', sql.Int, otherUserId).query(`
            SELECT
              (SELECT COUNT(*) FROM TinNhan WHERE MaNguoiGui=@to AND MaNguoiNhan=@from) AS TheyReplied,
              (SELECT COUNT(DISTINCT t.MaNguoiNhan) FROM TinNhan t
                 WHERE t.MaNguoiGui=@from AND t.NgayGui>=DATEADD(HOUR,-24,SYSDATETIME())
                   AND NOT EXISTS(SELECT 1 FROM TinNhan r WHERE r.MaNguoiGui=t.MaNguoiNhan AND r.MaNguoiNhan=@from)) AS Strangers`);
        if (!Number(spam.recordset[0].TheyReplied) && Number(spam.recordset[0].Strangers) >= 30)
            throw new Error('Bạn đã nhắn cho quá nhiều người lạ trong 24 giờ. Vui lòng thử lại sau.');

        const blocked = await p
            .request()
            .input('from', sql.Int, userId)
            .input('to', sql.Int, otherUserId)
            .query(
                'SELECT 1 AS Blocked WHERE EXISTS(SELECT 1 FROM ChanNguoiDung WHERE (MaNguoiChan=@from AND MaNguoiBiChan=@to) OR (MaNguoiChan=@to AND MaNguoiBiChan=@from))',
            );
        if (blocked.recordset.length)
            throw new Error('Không thể nhắn tin do một trong hai tài khoản đã chặn người còn lại.');

        if (type === 'text' && text) {
            const keywordMatch = await p
                .request()
                .input('content', sql.NVarChar(2000), text)
                .query(
                    `SELECT TOP 1 TuKhoa FROM TuKhoaCam WHERE TrangThai=1 AND CHARINDEX(TuKhoa,@content COLLATE Latin1_General_100_CI_AI)>0`,
                );
            if (keywordMatch.recordset.length) throw new Error('Tin nhắn chứa từ khóa không được phép.');
        }

        const r = await p
            .request()
            .input('from', sql.Int, userId)
            .input('to', sql.Int, otherUserId)
            .input('product', sql.Int, productId || null)
            .input('content', sql.NVarChar(2000), text || '')
            .input('type', sql.VarChar(16), type)
            .input('offer', sql.Decimal(18, 2), offer).query(`
                INSERT TinNhan(
                    MaNguoiGui,
                    MaNguoiNhan,
                    MaSanPham,
                    NoiDung,
                    LoaiTinNhan,
                    GiaDeXuat
                )

                OUTPUT INSERTED.*

                VALUES(
                    @from,
                    @to,
                    @product,
                    @content,
                    @type,
                    @offer
                )
            `);

        const message = r.recordset[0];

        // Lấy lại thông tin đầy đủ để gửi realtime
        const detail = await p.request().input('id', sql.Int, message.MaTinNhan).query(`
                SELECT

                    tm.MaTinNhan,
                    tm.MaNguoiGui,
                    tm.MaNguoiNhan,
                    tm.MaSanPham,

                    tm.NoiDung,
                    tm.LoaiTinNhan,
                    tm.GiaDeXuat,
                    tm.DaDoc,
                    TODATETIMEOFFSET(tm.NgayGui, '+07:00') AS NgayGui,

                    sender.HoTen AS TenNguoiGui,
                    receiver.HoTen AS TenNguoiNhan,

                    sp.TenSanPham,
                    sp.GiaBan,
                    sp.HinhAnh

                FROM TinNhan tm

                JOIN NguoiDung sender
                    ON sender.MaNguoiDung =
                        tm.MaNguoiGui

                JOIN NguoiDung receiver
                    ON receiver.MaNguoiDung =
                        tm.MaNguoiNhan

                LEFT JOIN SanPhamDoCu sp
                    ON sp.MaSanPham =
                        tm.MaSanPham

                WHERE tm.MaTinNhan = @id
            `);

        return detail.recordset[0] || message;
    }

    async markRead(userId, otherUserId, productId) {
        const p = await poolPromise;

        await p
            .request()
            .input('me', sql.Int, userId)
            .input('other', sql.Int, otherUserId)
            .input('product', sql.Int, productId || null).query(`
                UPDATE TinNhan

                SET DaDoc = 1

                WHERE
                    MaNguoiGui = @other
                    AND MaNguoiNhan = @me

                    AND
                    (
                        (
                            @product IS NULL
                            AND MaSanPham IS NULL
                        )

                        OR

                        MaSanPham = @product
                    )
            `);
    }
}

module.exports = new MessageDAL();
