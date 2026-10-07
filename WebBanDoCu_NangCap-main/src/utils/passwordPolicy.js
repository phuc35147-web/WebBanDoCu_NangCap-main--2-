/*
 * Chính sách mật khẩu dùng chung cho đăng ký, đổi mật khẩu, đặt lại mật khẩu.
 * - Tối thiểu 8 ký tự, tối đa 72 (giới hạn của bcrypt)
 * - Phải có cả chữ và số
 * - Chặn mật khẩu phổ biến, mật khẩu lặp ký tự và mật khẩu trùng email / số điện thoại
 */
const MIN_LENGTH = 8;
const MAX_LENGTH = 72;

const COMMON = new Set([
    '12345678',
    '123456789',
    '1234567890',
    '11111111',
    '00000000',
    '87654321',
    'password',
    'password1',
    'password123',
    'passw0rd',
    'qwerty123',
    'qwertyuiop',
    'abc12345',
    'abcd1234',
    'iloveyou1',
    'admin123',
    'admin1234',
    'admin12345',
    'matkhau123',
    'matkhau1',
    'changeme12345',
    'changeme123',
    'welcome123',
    'letmein123',
    'chodocu123',
]);

function validatePassword(password, context = {}) {
    const value = String(password ?? '');
    if (value.length < MIN_LENGTH) return `Mật khẩu tối thiểu ${MIN_LENGTH} ký tự.`;
    if (value.length > MAX_LENGTH) return `Mật khẩu tối đa ${MAX_LENGTH} ký tự.`;
    if (!/[A-Za-zÀ-ỹ]/.test(value) || !/\d/.test(value)) return 'Mật khẩu phải có cả chữ và số.';
    const lower = value.toLowerCase();
    if (COMMON.has(lower) || /^(.)\1+$/.test(value)) return 'Mật khẩu quá dễ đoán. Vui lòng chọn mật khẩu khác.';
    const email = String(context.email || '')
        .trim()
        .toLowerCase();
    const phone = String(context.phone || '').trim();
    if (email && (lower === email || lower === email.split('@')[0]))
        return 'Mật khẩu không được trùng với email của bạn.';
    if (phone && value === phone) return 'Mật khẩu không được trùng với số điện thoại của bạn.';
    return null;
}

function assertStrongPassword(password, context) {
    const problem = validatePassword(password, context);
    if (problem) throw Object.assign(new Error(problem), { status: 400 });
}

module.exports = { MIN_LENGTH, MAX_LENGTH, validatePassword, assertStrongPassword };
