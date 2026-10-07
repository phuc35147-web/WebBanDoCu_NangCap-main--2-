const dal = require('../dal/sanPhamDAL');
const communityDAL = require('../dal/communityDAL');
const security = require('../middleware/security');
const { geocodeAddress } = require('../services/geocodingService');
const { parsePrice, parseQuantity, MAX_PRICE } = require('../utils/productInput');

const CONDITIONS = ['Mới 99%', 'Đã qua sử dụng (còn tốt)', 'Cũ / Có trầy xước', 'Hỏng nhẹ / Cần sửa chữa'];
const REPORT_REASONS = [
    'Hàng giả',
    'Hàng cấm',
    'Thông tin sai sự thật',
    'Nghi ngờ lừa đảo',
    'Vi phạm bản quyền / ảnh ăn cắp',
    'Lý do khác',
];
function parseId(value, label) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw bad(`${label} không hợp lệ.`);
    return id;
}

/* Kiểm tra và chuẩn hóa dữ liệu tin đăng — dùng chung cho đăng mới và sửa tin */
function validateProductInput(d) {
    if (!d.maDanhMuc || !d.tenSanPham || !d.tinhTrang || !d.moTa || !d.diaChiXemHang || !d.giaBan)
        throw bad('Vui lòng điền đầy đủ thông tin sản phẩm.');
    if (!CONDITIONS.includes(d.tinhTrang)) throw bad('Vui lòng chọn tình trạng theo danh mục quy chuẩn.');
    const tenSanPham = String(d.tenSanPham).trim();
    const moTa = String(d.moTa).trim();
    const diaChiXemHang = String(d.diaChiXemHang).trim();
    if (tenSanPham.length < 5) throw bad('Tên sản phẩm phải có ít nhất 5 ký tự.');
    if (tenSanPham.length > 255) throw bad('Tên sản phẩm tối đa 255 ký tự.');
    if (moTa.length < 20) throw bad('Mô tả sản phẩm phải có ít nhất 20 ký tự.');
    if (moTa.length > 10000) throw bad('Mô tả sản phẩm tối đa 10.000 ký tự.');
    if (diaChiXemHang.length > 500) throw bad('Địa chỉ xem hàng tối đa 500 ký tự.');
    return {
        maDanhMuc: parseId(d.maDanhMuc, 'Danh mục'),
        tenSanPham,
        moTa,
        diaChiXemHang,
        tinhTrang: d.tinhTrang,
        giaBan: parsePrice(d.giaBan),
        soLuong: parseQuantity(d.soLuong),
    };
}

class B {
    async fetchProducts(f) {
        const filters = { ...f };
        for (const key of ['minPrice', 'maxPrice']) {
            if (filters[key] !== undefined && filters[key] !== '') {
                const price = Number(filters[key]);
                if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) throw Error('Khoảng giá không hợp lệ.');
                filters[key] = price;
            }
        }
        if (
            filters.minPrice !== undefined &&
            filters.maxPrice !== undefined &&
            filters.maxPrice !== '' &&
            filters.minPrice > filters.maxPrice
        )
            throw Error('Giá tối thiểu không được lớn hơn giá tối đa.');
        if (filters.tinhTrang && !CONDITIONS.includes(filters.tinhTrang)) throw Error('Tình trạng sản phẩm không hợp lệ.');
        if (!['newest', 'price-asc', 'price-desc', 'near'].includes(filters.sort)) filters.sort = 'newest';
        if (filters.sort === 'near') {
            filters.latitude = Number(filters.latitude);
            filters.longitude = Number(filters.longitude);
            if (
                !Number.isFinite(filters.latitude) ||
                filters.latitude < -90 ||
                filters.latitude > 90 ||
                !Number.isFinite(filters.longitude) ||
                filters.longitude < -180 ||
                filters.longitude > 180
            )
                throw Error('Không xác định được vị trí của bạn để sắp xếp tin gần nhất.');
        }
        return dal.getAll(filters);
    }
    async getProductById(id, viewer) {
        id = Number(id);
        if (!Number.isInteger(id) || id < 1) throw Error('Mã sản phẩm không hợp lệ.');
        const v = viewer || {};
        // Mỗi người xem (hoặc IP) chỉ tính 1 lượt xem / 30 phút cho mỗi tin: chặn F5 để tăng lượt xem ảo
        const key = v.userId ? `u${v.userId}` : `ip${v.ip || 'unknown'}`;
        return dal.getById(id, { ...v, shouldCount: () => security.shouldCountView(id, key) });
    }
    async addProduct(d, files) {
        const all = [...(files?.hinhAnh || []), ...(files?.hinhAnhs || [])];
        const file = all[0];
        const input = validateProductInput(d);
        if (!file) throw bad('Bạn phải chọn ít nhất 1 ảnh minh họa.');
        if (all.length > 8) throw bad('Mỗi tin tối đa 8 ảnh.');
        const seller = parseId(d.maNguoiBan, 'Người bán');
        await communityDAL.assertAllowedText(`${input.tenSanPham} ${input.moTa}`);
        await communityDAL.assertNotDuplicate(seller, input.maDanhMuc, input.tenSanPham);
        const coordinates = await geocodeAddress(input.diaChiXemHang);
        return dal.create({
            ...input,
            maNguoiBan: seller,
            hinhAnh: `/uploads/${file.filename}`,
            hinhAnhs: all,
            ...coordinates,
        });
    }
    async updateProduct(id, seller, d, files) {
        const productId = parseId(id, 'Mã sản phẩm');
        const input = validateProductInput(d);
        await communityDAL.assertAllowedText(`${input.tenSanPham} ${input.moTa}`);
        await communityDAL.assertNotDuplicate(Number(seller), input.maDanhMuc, input.tenSanPham, productId);
        const coordinates = await geocodeAddress(input.diaChiXemHang);
        // anhGiu: danh sách đường dẫn ảnh cũ muốn GIỮ theo thứ tự mới (ảnh đầu tiên là ảnh chính). Ảnh không có trong danh sách sẽ bị xóa.
        let keep;
        if (d.anhGiu !== undefined && d.anhGiu !== '') {
            try {
                keep = JSON.parse(d.anhGiu);
            } catch (_) {
                throw bad('Danh sách ảnh giữ lại không hợp lệ.');
            }
            if (!Array.isArray(keep) || keep.some((x) => typeof x !== 'string')) throw bad('Danh sách ảnh giữ lại không hợp lệ.');
        }
        return dal.updateOwned(productId, seller, { ...input, ...coordinates }, files, keep);
    }
    async deleteProduct(id, seller) {
        return dal.deleteOwned(parseId(id, 'Mã sản phẩm'), seller);
    }
    async getCategories() {
        return dal.getCategories();
    }
    async fetchAllForAdmin() {
        return dal.getAllForAdmin();
    }
    async changeStatus(id, status, reason) {
        if (!['Chờ duyệt', 'Đang bán', 'Đã bán', 'Ẩn', 'Từ chối'].includes(status))
            throw Error('Trạng thái không hợp lệ.');
        if (status === 'Từ chối' && !String(reason || '').trim()) throw Error('Vui lòng nhập lý do từ chối.');
        return dal.updateStatus(Number(id), status, reason);
    }
    async addReview(productId, userId, rating, comment) {
        productId = parseId(productId, 'Mã sản phẩm');
        rating = Number(rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Số sao phải từ 1 đến 5.');
        comment = String(comment || '').trim();
        if (comment.length > 1000) throw bad('Nhận xét không được vượt quá 1000 ký tự.');
        await communityDAL.assertAllowedText(comment);
        return dal.addReview(productId, Number(userId), rating, comment);
    }
    async createReport(productId, userId, reason, details) {
        productId = parseId(productId, 'Mã sản phẩm');
        reason = String(reason || '').trim();
        details = String(details || '').trim();
        if (!REPORT_REASONS.includes(reason)) throw bad('Vui lòng chọn lý do báo cáo hợp lệ.');
        if (details.length > 1000) throw bad('Nội dung bổ sung không được vượt quá 1000 ký tự.');
        return dal.createReport(productId, Number(userId), reason, details);
    }
}
module.exports = new B();
module.exports.CONDITIONS = CONDITIONS;
module.exports.REPORT_REASONS = REPORT_REASONS;
