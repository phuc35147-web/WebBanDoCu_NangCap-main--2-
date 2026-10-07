const dal = require('../dal/extraDAL');
const security = require('../middleware/security');
const AppError = require('../errors/AppError');
const { assertStrongPassword } = require('../utils/passwordPolicy');

const posInt = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const wrap =
    (fn, okStatus = 200) =>
    async (req, res, next) => {
        try {
            const out = await fn(req, res);
            if (!res.headersSent) res.status(okStatus).json(out === undefined ? { ok: true } : out);
        } catch (e) {
            next(AppError.from(e, 400));
        }
    };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

/* ---- Yêu thích ---- */
exports.favIds = wrap(async (req) => ({ ids: await dal.favoriteIds(req.user.id) }));
exports.favList = wrap((req) => dal.listFavorites(req.user.id));
exports.favAdd = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    await dal.addFavorite(Number(req.user.id), id);
    return { message: 'Đã lưu tin.', saved: true };
});
exports.favRemove = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    await dal.removeFavorite(Number(req.user.id), id);
    return { message: 'Đã bỏ lưu tin.', saved: false };
});

/* ---- Thông báo ---- */
exports.notifList = wrap((req) => dal.notifications(req.user.id));
exports.notifRead = wrap(async (req) => {
    const id = req.body && req.body.id !== undefined ? posInt(req.body.id) : null;
    if (req.body && req.body.id !== undefined && !id) throw bad('Mã thông báo không hợp lệ.');
    await dal.markNotificationsRead(req.user.id, id);
    return { message: 'Đã đánh dấu đã đọc.' };
});

/* ---- Hồ sơ người bán ---- */
exports.sellerProfile = wrap(async (req, res) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã người bán không hợp lệ.');
    const data = await dal.sellerProfile(id);
    if (!data) {
        res.status(404).json({ message: 'Không tìm thấy người bán.' });
        return;
    }
    return data;
});

/* ---- Đã bán / Đẩy tin ---- */
exports.markSold = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    const raw = req.body && req.body.buyerId;
    const buyerId = raw === undefined || raw === null || raw === '' ? null : posInt(raw);
    if (raw !== undefined && raw !== null && raw !== '' && !buyerId) throw bad('Người mua không hợp lệ.');
    if (buyerId && buyerId === Number(req.user.id)) throw bad('Bạn không thể chọn chính mình làm người mua.');
    await dal.markSold(id, Number(req.user.id), buyerId);
    return { message: 'Đã đánh dấu tin là Đã bán.' };
});
exports.buyerCandidates = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    return dal.listBuyerCandidates(id, Number(req.user.id));
});
exports.bump = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    await dal.bump(id, Number(req.user.id));
    return { message: 'Đã đẩy tin lên đầu danh sách.' };
});

/* ---- Đổi mật khẩu ---- */
exports.changePassword = wrap(async (req) => {
    const { matKhauCu, matKhauMoi } = req.body || {};
    if (!matKhauCu || !matKhauMoi) throw bad('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.');
    assertStrongPassword(matKhauMoi, { email: req.user.email });
    if (matKhauCu === matKhauMoi) throw bad('Mật khẩu mới phải khác mật khẩu hiện tại.');
    await dal.changePassword(Number(req.user.id), matKhauCu, matKhauMoi);
    // Mọi token cũ (kể cả của kẻ chiếm tài khoản) mất hiệu lực; cấp token mới cho chính phiên này
    security.clearUserStatusCache();
    const token = require('../bll/nguoiDungBLL').issueToken(req.user);
    return { message: 'Đổi mật khẩu thành công. Các thiết bị khác sẽ phải đăng nhập lại.', token };
});

/* ---- Số điện thoại người bán ---- */
exports.sellerPhone = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã sản phẩm không hợp lệ.');
    return { phone: await dal.sellerPhone(id) };
});

/* ---- Admin ---- */
exports.adminUsers = wrap((req) => dal.listUsers(req.query.q));
exports.adminUserStatus = wrap(async (req) => {
    const id = posInt(req.params.id);
    if (!id) throw bad('Mã người dùng không hợp lệ.');
    if (typeof req.body.active !== 'boolean') throw bad('Thiếu trạng thái "active" (true/false).');
    await dal.setUserActive(id, req.body.active);
    security.invalidateUserStatus(id);
    await dal.logAdmin(req.admin.email, req.body.active ? 'Mở khóa người dùng' : 'Khóa người dùng', 'NguoiDung', id);
    return { message: req.body.active ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.' };
});
exports.adminLogs = wrap(() => dal.adminLogs());

/* Ghi nhật ký cho các thao tác admin có sẵn (không đổi code cũ, chỉ chèn thêm middleware) */
exports.logAfter = (action, target, contentFn) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode < 400 && req.admin) {
            const id = posInt(req.params.id);
            let content = null;
            try {
                content = contentFn ? contentFn(req) : null;
            } catch (error) {
                console.error('Không thể tạo nội dung nhật ký quản trị:', error);
            }
            dal.logAdmin(req.admin.email, action, target, id, content).catch((error) => {
                console.error('Không thể ghi nhật ký quản trị:', error);
            });
        }
    });
    next();
};
