const user = require('../bll/nguoiDungBLL');
const admin = require('../bll/adminBLL');
const emailOtp = require('../bll/emailOtpBLL');
const AppError = require('../errors/AppError');
exports.register = async (req, res, next) => {
    try {
        res.status(201).json({ message: 'Đăng ký thành công!', ...(await user.register(req.body)) });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.login = async (req, res, next) => {
    try {
        res.json({
            message: 'Đăng nhập thành công!',
            ...(await user.login(
                req.body.identifier || req.body.email || req.body.soDienThoai,
                req.body.matKhau || req.body.password,
            )),
        });
    } catch (e) {
        next(AppError.from(e, 401));
    }
};
exports.adminLogin = async (req, res, next) => {
    try {
        res.json({
            message: 'Đăng nhập quản trị thành công!',
            ...(await admin.login(req.body.email, req.body.password, req.body.otp)),
        });
    } catch (e) {
        if (e.needOtp) return res.status(401).json({ message: e.message, needOtp: true });
        next(AppError.from(e, 401));
    }
};
exports.checkPhone = async (req, res, next) => {
    try {
        res.json(await user.checkPhone(req.body.soDienThoai || req.body.phone));
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.sendEmailOtp = async (req, res, next) => {
    try {
        res.json(await emailOtp.send(req.body.email, req.body.purpose));
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.verifyEmailOtp = async (req, res, next) => {
    try {
        res.json(await emailOtp.verify(req.body.email, req.body.purpose, req.body.code));
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.resetPassword = async (req, res, next) => {
    try {
        res.json(await emailOtp.resetPassword(req.body.email, req.body.verificationToken, req.body.newPassword));
    } catch (e) {
        next(AppError.from(e, 400));
    }
};

exports.verifyTokenMiddleware = async (req, res, next) => {
    let payload;
    try {
        const h = req.headers.authorization || '';
        if (!h.startsWith('Bearer ')) return res.status(401).json({ message: 'Bạn chưa đăng nhập.' });
        payload = user.verifyToken(h.slice(7));
    } catch (e) {
        return res.status(403).json({ message: 'Phiên đăng nhập hết hạn.' });
    }
    try {
        const sess = await require('../middleware/security').sessionInfo(Number(payload.id));
        if (!sess.active) return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa.' });
        if (sess.changedAt && Number(payload.iat || 0) < Math.floor(sess.changedAt / 1000))
            return res.status(401).json({ message: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.' });
    } catch (e) {
        return next(e);
    }
    req.user = payload;
    next();
};
exports.verifyAdminMiddleware = async (req, res, next) => {
    let payload;
    try {
        const h = req.headers.authorization || '';
        if (!h.startsWith('Bearer ')) return res.status(401).json({ message: 'Bạn chưa đăng nhập quản trị.' });
        payload = admin.verifyToken(h.slice(7));
    } catch (e) {
        return res.status(403).json({ message: 'Phiên quản trị hết hạn.' });
    }
    try {
        // Kiểm tra lại với DB: admin bị khóa / hạ quyền / đổi mật khẩu thì token 8 giờ cũ không còn dùng được
        await require('../middleware/security').assertAdminSession(payload);
    } catch (e) {
        return res.status(e.statusCode || e.status || 403).json({ message: e.message });
    }
    req.admin = payload;
    next();
};
