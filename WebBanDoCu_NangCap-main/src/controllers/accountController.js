const bll = require('../bll/accountBLL');
const AppError = require('../errors/AppError');
exports.getAccount = async (req, res, next) => {
    try {
        res.json(await bll.getAccount(req.user.id, req.user.email));
    } catch (e) {
        next(AppError.from(e));
    }
};
exports.updateAccount = async (req, res, next) => {
    try {
        res.json({
            message: 'Cập nhật thông tin thành công.',
            profile: await bll.updateProfile(req.user.id, req.body),
        });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};
exports.getListings = async (req, res, next) => {
    try {
        res.json(await bll.getListings(req.user.id));
    } catch (e) {
        next(AppError.from(e));
    }
};
