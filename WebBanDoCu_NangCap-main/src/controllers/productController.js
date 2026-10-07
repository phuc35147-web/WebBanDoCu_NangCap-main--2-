const bll = require('../bll/sanPhamBLL');
const userDAL = require('../dal/nguoiDungDAL');
const AppError = require('../errors/AppError');

// Mọi tài khoản đã đăng nhập đều được phép đăng tin. Không yêu cầu VaiTro='seller'.
// Chỉ Admin mới có quyền đổi trạng thái Chờ duyệt -> Đang bán.
// Nếu token cũ lệch ID sau khi database được reset/reimport, tìm lại theo email.
async function resolveCurrentUser(req) {
    const tokenUser = req.user || {};
    let u = null;
    if (Number.isInteger(Number(tokenUser.id)) && Number(tokenUser.id) > 0) {
        u = await userDAL.findById(Number(tokenUser.id));
    }
    if (!u && tokenUser.email) {
        u = await userDAL.findByEmail(tokenUser.email);
    }
    if (!u || !u.TrangThai)
        throw Error('Tài khoản không tồn tại hoặc đã bị khóa. Vui lòng đăng xuất và đăng nhập lại.');
    return u;
}

exports.getProducts = async (req, res, next) => {
    try {
        const rows = await bll.fetchProducts(req.query);
        if (req.query.page !== undefined || req.query.limit !== undefined) {
            res.setHeader('X-Total-Count', String(rows.length ? rows[0].TotalCount : 0));
            res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
        }
        res.json(rows);
    } catch (e) {
        next(AppError.from(e, e.message && /không hợp lệ|không được/.test(e.message) ? 400 : 500));
    }
};
exports.getProductById = async (req, res, next) => {
    try {
        const p = await bll.getProductById(req.params.id, { userId: req.user && req.user.id, isAdmin: !!req.admin, ip: req.ip });
        if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        res.json(p);
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.getCategories = async (req, res, next) => {
    try {
        res.json(await bll.getCategories());
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.review = async (req, res, next) => {
    try {
        await bll.addReview(req.params.id, req.user.id, req.body.soSao, req.body.noiDung);
        res.status(201).json({ message: 'Cảm ơn bạn đã đánh giá người bán.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.report = async (req, res, next) => {
    try {
        await bll.createReport(req.params.id, req.user.id, req.body.loaiViPham, req.body.chiTiet);
        res.status(201).json({ message: 'Đã gửi báo cáo. Quản trị viên sẽ xem xét tin đăng.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.createProduct = async (req, res, next) => {
    try {
        const u = await resolveCurrentUser(req);
        res.status(201).json({
            message: 'Đăng sản phẩm thành công.',
            product: await bll.addProduct({ ...req.body, maNguoiBan: u.MaNguoiDung }, req.files),
        });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.updateProduct = async (req, res, next) => {
    try {
        const u = await resolveCurrentUser(req);
        res.json({
            message: 'Cập nhật tin thành công, tin được đưa về trạng thái chờ duyệt.',
            product: await bll.updateProduct(req.params.id, u.MaNguoiDung, req.body, req.files),
        });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.deleteProduct = async (req, res, next) => {
    try {
        const u = await resolveCurrentUser(req);
        await bll.deleteProduct(req.params.id, u.MaNguoiDung);
        res.json({ message: 'Đã xóa tin đăng.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
