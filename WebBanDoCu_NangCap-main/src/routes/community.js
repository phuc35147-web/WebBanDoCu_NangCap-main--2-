const controller = require('../controllers/communityController');
const { logAfter } = require('../controllers/extraController');

module.exports = (app, { auth }) => {
    const user = auth.verifyTokenMiddleware;
    const admin = auth.verifyAdminMiddleware;

    app.get('/api/users/blocked', user, controller.blockedUsers);
    app.post('/api/users/:id/block', user, controller.blockUser);
    app.delete('/api/users/:id/block', user, controller.unblockUser);
    app.post('/api/users/:id/reports', user, controller.reportUser);

    app.post('/api/sellers/:id/follow', user, controller.follow);
    app.delete('/api/sellers/:id/follow', user, controller.unfollow);
    app.get('/api/sellers/:id/follow', user, controller.followStatus);
    app.patch(
        '/api/admin/users/:id/verified',
        admin,
        logAfter('Đổi trạng thái xác minh người dùng', 'NguoiDung', (req) => (req.body.verified ? 'Xác minh' : 'Gỡ xác minh')),
        controller.verifyUser,
    );
    app.get('/api/admin/user-reports', admin, controller.userReports);
    app.patch(
        '/api/admin/user-reports/:id',
        admin,
        logAfter('Xử lý báo cáo người dùng', 'BaoCaoNguoiDung', (req) => String(req.body.status || '')),
        controller.resolveUserReport,
    );
    app.get('/api/admin/prohibited-keywords', admin, controller.keywords);
    app.post(
        '/api/admin/prohibited-keywords',
        admin,
        logAfter('Thêm từ khóa cấm', 'TuKhoaCam', (req) => String(req.body.keyword || '').slice(0, 100)),
        controller.addKeyword,
    );
    app.delete(
        '/api/admin/prohibited-keywords/:id',
        admin,
        logAfter('Xóa từ khóa cấm', 'TuKhoaCam'),
        controller.removeKeyword,
    );

    app.get('/api/search/suggestions', controller.suggestions);
    app.get('/api/search/saved', user, controller.savedSearches);
    app.post('/api/search/saved', user, controller.saveSearch);
    app.delete('/api/search/saved/:id', user, controller.deleteSavedSearch);
    app.get('/api/products/recently-viewed', user, controller.recentlyViewed);
    app.post('/api/products/:id/viewed', user, controller.recordView);
};
