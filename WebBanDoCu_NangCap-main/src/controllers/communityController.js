const dal = require('../dal/communityDAL');
const AppError = require('../errors/AppError');

const positiveId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const wrap =
    (handler, statusCode = 200) =>
    async (req, res, next) => {
        try {
            const result = await handler(req);
            res.status(statusCode).json(result === undefined ? { ok: true } : result);
        } catch (error) {
            next(AppError.from(error, 400));
        }
    };

const allowedFilters = new Set(['keyword', 'maDanhMuc', 'location', 'minPrice', 'maxPrice', 'tinhTrang', 'sort']);
function readFilters(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!allowedFilters.has(key) || raw === undefined || raw === null) continue;
        const normalized = String(raw).trim();
        if (normalized.length > 255) throw Object.assign(new Error('Bộ lọc tìm kiếm quá dài.'), { status: 400 });
        if (normalized) output[key] = normalized;
    }
    return output;
}

exports.blockedUsers = wrap((req) => dal.blockedUsers(Number(req.user.id)));
exports.blockUser = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã người dùng không hợp lệ.'), { status: 400 });
    await dal.changeBlock(Number(req.user.id), id, true);
    return { message: 'Đã chặn người dùng.' };
});
exports.unblockUser = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã người dùng không hợp lệ.'), { status: 400 });
    await dal.changeBlock(Number(req.user.id), id, false);
    return { message: 'Đã bỏ chặn người dùng.' };
});
exports.reportUser = wrap(async (req) => {
    const id = positiveId(req.params.id);
    const reason = String(req.body.reason || '').trim();
    const details = String(req.body.details || '').trim();
    if (!id) throw Object.assign(new Error('Mã người dùng không hợp lệ.'), { status: 400 });
    if (!['Lừa đảo', 'Quấy rối', 'Thông tin giả', 'Lý do khác'].includes(reason))
        throw Object.assign(new Error('Lý do báo cáo không hợp lệ.'), { status: 400 });
    if (details.length > 1000) throw Object.assign(new Error('Nội dung báo cáo tối đa 1000 ký tự.'), { status: 400 });
    await dal.reportUser(Number(req.user.id), id, reason, details);
    return { message: 'Đã gửi báo cáo người dùng để quản trị viên xem xét.' };
}, 201);

exports.follow = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã hồ sơ không hợp lệ.'), { status: 400 });
    await dal.follow(Number(req.user.id), id, true);
    return { message: 'Đã theo dõi người bán.', following: true };
});
exports.unfollow = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã hồ sơ không hợp lệ.'), { status: 400 });
    await dal.follow(Number(req.user.id), id, false);
    return { message: 'Đã hủy theo dõi người bán.', following: false };
});
exports.followStatus = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã hồ sơ không hợp lệ.'), { status: 400 });
    const followers = await dal.followStatus(Number(req.user.id), id);
    return followers;
});
exports.verifyUser = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id || typeof req.body.verified !== 'boolean')
        throw Object.assign(new Error('Mã người dùng hoặc trạng thái xác minh không hợp lệ.'), { status: 400 });
    await dal.setVerified(id, req.body.verified);
    return { message: req.body.verified ? 'Đã xác minh hồ sơ người bán.' : 'Đã gỡ huy hiệu xác minh.' };
});
exports.userReports = wrap(() => dal.listUserReports());
exports.resolveUserReport = wrap(async (req) => {
    const id = positiveId(req.params.id);
    const status = String(req.body.status || '');
    if (!id || !['Đã xử lý', 'Bỏ qua'].includes(status))
        throw Object.assign(new Error('Báo cáo hoặc trạng thái không hợp lệ.'), { status: 400 });
    await dal.resolveUserReport(id, status);
    return { message: 'Đã cập nhật trạng thái báo cáo người dùng.' };
});
exports.keywords = wrap(() => dal.listKeywords());
exports.addKeyword = wrap(async (req) => {
    const keyword = String(req.body.keyword || '').trim();
    if (keyword.length < 2 || keyword.length > 100)
        throw Object.assign(new Error('Từ khóa phải dài từ 2 đến 100 ký tự.'), { status: 400 });
    await dal.addKeyword(keyword);
    return { message: 'Đã thêm từ khóa cấm.' };
}, 201);
exports.removeKeyword = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã từ khóa không hợp lệ.'), { status: 400 });
    await dal.removeKeyword(id);
    return { message: 'Đã xóa từ khóa cấm.' };
});
exports.suggestions = wrap(async (req) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return { suggestions: [] };
    if (query.length > 100) throw Object.assign(new Error('Từ khóa tìm kiếm quá dài.'), { status: 400 });
    return { suggestions: await dal.suggestions(query) };
});
exports.savedSearches = wrap((req) => dal.savedSearches(Number(req.user.id)));
exports.saveSearch = wrap(async (req) => {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 100)
        throw Object.assign(new Error('Tên tìm kiếm dài tối đa 100 ký tự.'), { status: 400 });
    await dal.saveSearch(Number(req.user.id), name, readFilters(req.body.filters));
    return { message: 'Đã lưu tìm kiếm.' };
}, 201);
exports.deleteSavedSearch = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã tìm kiếm không hợp lệ.'), { status: 400 });
    await dal.deleteSavedSearch(Number(req.user.id), id);
    return { message: 'Đã xóa tìm kiếm đã lưu.' };
});
exports.recordView = wrap(async (req) => {
    const id = positiveId(req.params.id);
    if (!id) throw Object.assign(new Error('Mã tin không hợp lệ.'), { status: 400 });
    await dal.recordView(Number(req.user.id), id);
    return { ok: true };
});
exports.recentlyViewed = wrap((req) => dal.recentlyViewed(Number(req.user.id)));
