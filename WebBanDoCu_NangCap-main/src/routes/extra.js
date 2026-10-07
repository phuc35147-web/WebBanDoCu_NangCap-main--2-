const c = require('../controllers/extraController');
const adminController = require('../controllers/adminController');
const { rateLimit } = require('../middleware/security');

module.exports = function mountExtraRoutes(app, { auth }) {
    const user = auth.verifyTokenMiddleware;
    const admin = auth.verifyAdminMiddleware;

    /* Yêu thích (đặt /ids trước /:id) */
    app.get('/api/favorites/ids', user, c.favIds);
    app.get('/api/favorites', user, c.favList);
    app.post('/api/favorites/:id', user, c.favAdd);
    app.delete('/api/favorites/:id', user, c.favRemove);

    /* Thông báo */
    app.get('/api/notifications', user, c.notifList);
    app.patch('/api/notifications/read', user, c.notifRead);

    /* Hồ sơ người bán công khai (không lộ email / số điện thoại) */
    app.get('/api/sellers/:id', c.sellerProfile);

    /* Số điện thoại người bán: phải đăng nhập, tối đa 30 lượt / 10 phút / tài khoản (chống cào dữ liệu) */
    app.get(
        '/api/products/:id/phone',
        user,
        rateLimit({
            windowMs: 10 * 60 * 1000,
            max: 30,
            key: (req) => 'phone:' + (req.user && req.user.id),
            message: 'Bạn xem số điện thoại quá nhiều. Vui lòng thử lại sau.',
        }),
        c.sellerPhone,
    );

    /* Quản lý tin của chính mình */
    app.get('/api/products/:id/buyers', user, c.buyerCandidates);
    app.patch('/api/products/:id/sold', user, c.markSold);
    app.patch('/api/products/:id/bump', user, c.bump);

    /* Tài khoản */
    app.put(
        '/api/account/password',
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 10,
            message: 'Bạn đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau.',
        }),
        user,
        c.changePassword,
    );

    /* Admin */
    app.get('/api/admin/dashboard', admin, adminController.dashboard);
    app.post('/api/admin/products/bulk', admin, adminController.bulkModerateProducts);
    app.get('/api/admin/users', admin, c.adminUsers);
    app.patch('/api/admin/users/:id/status', admin, c.adminUserStatus);
    app.get('/api/admin/logs', admin, c.adminLogs);

    /* Xác thực 2 bước (TOTP) cho admin */
    app.post('/api/admin/2fa/setup', admin, adminController.totpSetup);
    app.post('/api/admin/2fa/enable', admin, c.logAfter('Bật 2FA quản trị', 'NguoiDung'), adminController.totpEnable);
    app.post('/api/admin/2fa/disable', admin, c.logAfter('Tắt 2FA quản trị', 'NguoiDung'), adminController.totpDisable);
};
