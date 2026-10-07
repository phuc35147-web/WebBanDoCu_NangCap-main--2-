/* Kiểm tra giá và số lượng của tin đăng (tách riêng để dễ kiểm thử, không phụ thuộc DB) */
/* Cột GiaBan là DECIMAL(18,2); giới hạn thực tế 1.000 tỷ đồng để tránh tràn số và giá vô lý */
const MAX_PRICE = 1_000_000_000_000;
const MAX_QUANTITY = 9999;

function bad(message) {
    return Object.assign(new Error(message), { status: 400 });
}

/* Chuyển giá trị người dùng nhập thành số hợp lệ, chặn NaN / Infinity / âm / quá lớn */
function parsePrice(value) {
    const text = String(value ?? '')
        .trim()
        .replace(/[\s.,đ₫]/gi, '');
    if (!/^\d+$/.test(text)) throw bad('Giá bán không hợp lệ.');
    const price = Number(text);
    if (!Number.isFinite(price) || price <= 0) throw bad('Giá bán phải lớn hơn 0.');
    if (price > MAX_PRICE) throw bad('Giá bán quá lớn (tối đa 1.000 tỷ đồng).');
    return price;
}

function parseQuantity(value) {
    if (value === undefined || value === null || String(value).trim() === '') return 1;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) throw bad('Số lượng phải là số nguyên từ 1 trở lên.');
    if (quantity > MAX_QUANTITY) throw bad(`Số lượng tối đa ${MAX_QUANTITY}.`);
    return quantity;
}


module.exports = { parsePrice, parseQuantity, MAX_PRICE, MAX_QUANTITY };
