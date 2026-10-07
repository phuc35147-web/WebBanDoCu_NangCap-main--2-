const dal = require('../dal/nguoiDungDAL');
const emailOtp = require('./emailOtpBLL');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET = require('../config/secrets').userSecret();
const { assertStrongPassword } = require('../utils/passwordPolicy');
const PHONE = /^0\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_REGISTER_ERROR =
    'Không thể đăng ký bằng thông tin này. Nếu bạn đã có tài khoản, hãy đăng nhập hoặc dùng "Quên mật khẩu".';
class B {
    async register(d) {
        if (!d.hoTen || !d.email || !d.soDienThoai || !d.matKhau || !d.tinhThanh || !d.phuongXa || !d.diaChiChiTiet)
            throw Error('Vui lòng điền đầy đủ thông tin.');
        if (!EMAIL.test(String(d.email)) || String(d.email).length > 255) throw Error('Email không hợp lệ.');
        if (!PHONE.test(d.soDienThoai)) throw Error('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.');
        assertStrongPassword(d.matKhau, { email: d.email, phone: d.soDienThoai });
        // Thu thập email, số điện thoại, địa chỉ => bắt buộc có sự đồng ý rõ ràng của người dùng
        if (!(d.dongYDieuKhoan === true || d.dongYDieuKhoan === 'true' || d.dongYDieuKhoan === 'on' || d.dongYDieuKhoan === 1 || d.dongYDieuKhoan === '1'))
            throw Error('Bạn cần đồng ý Điều khoản sử dụng và Chính sách bảo mật để đăng ký.');
        // Không nói rõ email hay số điện thoại nào đã tồn tại (chống dò tài khoản)
        const otpId = emailOtp.registrationOtpId(d.email, d.emailOtpToken);
        if ((await dal.findByEmail(d.email)) || (await dal.findByPhone(d.soDienThoai))) throw Error(GENERIC_REGISTER_ERROR);
        const hash = await bcrypt.hash(d.matKhau, 12);
        try {
            await dal.create({ ...d, otpId, matKhau: hash });
        } catch (error) {
            // Va chạm UNIQUE do đăng ký song song cũng trả thông báo chung
            if (error && (error.number === 2627 || error.number === 2601)) throw Error(GENERIC_REGISTER_ERROR);
            throw error;
        }
        return this.login(d.email, d.matKhau);
    }
    async login(identifier, password) {
        const u = String(identifier || '').includes('@')
            ? await dal.findByEmail(identifier)
            : await dal.findByPhone(identifier);
        if (!u || !u.TrangThai || !(await bcrypt.compare(String(password || ''), u.MatKhau)))
            throw Error('Email/số điện thoại hoặc mật khẩu không chính xác.');
        const token = jwt.sign({ id: u.MaNguoiDung, hoTen: u.HoTen, email: u.Email, vaiTro: u.VaiTro }, SECRET, {
            expiresIn: '7d',
        });
        return {
            token,
            user: { id: u.MaNguoiDung, hoTen: u.HoTen, email: u.Email, soDienThoai: u.SoDienThoai, vaiTro: u.VaiTro },
        };
    }
    /*
     * Trước đây trả về số điện thoại đã đăng ký hay chưa => dùng để dò danh sách khách hàng.
     * Nay chỉ kiểm tra định dạng; việc trùng số được báo chung chung khi đăng ký.
     */
    async checkPhone(p) {
        if (!PHONE.test(String(p || ''))) throw Error('Số điện thoại không hợp lệ.');
        return { exists: false, canContinue: true };
    }
    verifyToken(t) {
        return jwt.verify(t, SECRET);
    }
    issueToken(u) {
        return jwt.sign({ id: u.id, hoTen: u.hoTen, email: u.email, vaiTro: u.vaiTro }, SECRET, { expiresIn: '7d' });
    }
}
module.exports = new B();
