const sanPhamBLL = require('../bll/sanPhamBLL');
const adminBLL = require('../bll/adminBLL');
const AppError = require('../errors/AppError');
exports.getProducts = async (req, res, next) => {
    try {
        res.json(await sanPhamBLL.fetchAllForAdmin());
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.updateProductStatus = async (req, res, next) => {
    try {
        const reason = String(req.body.lyDoTuChoi || '').trim();
        if (req.body.trangThai === 'Từ chối' && !reason)
            return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối.' });
        if (reason.length > 1000)
            return res.status(400).json({ message: 'Lý do từ chối không được vượt quá 1000 ký tự.' });
        await sanPhamBLL.changeStatus(Number(req.params.id), req.body.trangThai, reason);
        res.json({ message: 'Đã cập nhật trạng thái sản phẩm.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.getReports = async (req, res, next) => {
    try {
        res.json(await adminBLL.getReports());
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.updateReport = async (req, res, next) => {
    try {
        const status = String(req.body.trangThai || '');
        if (!['Đã xử lý', 'Bỏ qua'].includes(status))
            return res.status(400).json({ message: 'Trạng thái báo cáo không hợp lệ.' });
        await adminBLL.updateReport(Number(req.params.id), status, req.body.anTin === true);
        res.json({ message: req.body.anTin ? 'Đã xử lý báo cáo và ẩn tin đăng.' : 'Đã cập nhật báo cáo.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.getHomepageContent = async (req, res, next) => {
    try {
        res.json((await adminBLL.getHomepageContent()) || {});
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.updateHomepageContent = async (req, res, next) => {
    try {
        const c = await adminBLL.getHomepageContent();
        const image = req.file ? `/uploads/${req.file.filename}` : req.body.heroImageUrl || c?.HeroImageUrl || null;
        res.json({
            message: 'Đã cập nhật trang chủ.',
            content: await adminBLL.saveHomepageContent({
                heroTitle: req.body.heroTitle,
                heroSubtitle: req.body.heroSubtitle,
                heroDescription: req.body.heroDescription,
                heroImageUrl: image,
            }),
        });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.stats = async (req, res, next) => {
    try {
        res.json(await adminBLL.stats());
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.dashboard = async (req, res, next) => {
    try {
        res.json(await adminBLL.dashboard());
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.bulkModerateProducts = async (req, res, next) => {
    try {
        const ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100)
            return res.status(400).json({ message: 'Chọn từ 1 đến 100 tin đăng.' });
        if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length)
            return res.status(400).json({ message: 'Danh sách mã tin đăng không hợp lệ.' });

        const action = req.body.action;
        if (!['approve', 'hide', 'delete', 'status'].includes(action))
            return res.status(400).json({ message: 'Thao tác kiểm duyệt không hợp lệ.' });
        const statuses = {
            approve: 'Đang bán',
            hide: 'Ẩn',
            status: req.body.trangThai,
        };
        const status = statuses[action];
        if (action !== 'delete' && !['Chờ duyệt', 'Đang bán', 'Đã bán', 'Ẩn', 'Từ chối'].includes(status))
            return res.status(400).json({ message: 'Trạng thái sản phẩm không hợp lệ.' });
        const reason = String(req.body.lyDoTuChoi || '').trim();
        if (status === 'Từ chối' && !reason) return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối.' });
        if (reason.length > 1000)
            return res.status(400).json({ message: 'Lý do từ chối không được vượt quá 1000 ký tự.' });

        const result = await adminBLL.bulkModerateProducts(ids, action, status, reason, req.admin?.email);
        res.json({ message: `Đã xử lý ${result.affected} tin đăng.`, affected: result.affected });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};

exports.totpSetup = async (req, res, next) => {
    try {
        res.json(await adminBLL.totpSetup(Number(req.admin.adminId), req.admin.email));
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.totpEnable = async (req, res, next) => {
    try {
        await adminBLL.totpEnable(Number(req.admin.adminId), req.body.code);
        res.json({ message: 'Đã bật xác thực 2 bước. Lần đăng nhập sau bạn sẽ cần nhập mã 6 số.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.totpDisable = async (req, res, next) => {
    try {
        await adminBLL.totpDisable(Number(req.admin.adminId), req.body.password, req.body.code);
        res.json({ message: 'Đã tắt xác thực 2 bước.' });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
