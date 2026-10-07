const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dal = require('../dal/adminDAL');
const SECRET = require('../config/secrets').adminSecret();
const totp = require('../utils/totp');
class B {
    async login(email, password, otp) {
        const a = await dal.findByEmail(email || '');
        if (!a || !a.IsActive || !(await bcrypt.compare(String(password || ''), a.PasswordHash)))
            throw Error('Email hoặc mật khẩu quản trị không chính xác.');
        // Bật 2FA: sau khi đúng mật khẩu phải nhập thêm mã 6 số từ ứng dụng xác thực
        if (a.TotpEnabled) {
            if (!otp) throw Object.assign(Error('Vui lòng nhập mã xác thực 2 bước.'), { needOtp: true });
            if (!totp.verify(a.TotpSecret, otp)) throw Error('Mã xác thực 2 bước không đúng hoặc đã hết hạn.');
        }
        const token = jwt.sign(
            { adminId: a.AdminUserId, email: a.Email, displayName: a.DisplayName, tokenType: 'admin', mfa: !!a.TotpEnabled },
            SECRET,
            { expiresIn: '8h' },
        );
        return {
            token,
            user: { id: a.AdminUserId, email: a.Email, displayName: a.DisplayName, tokenType: 'admin', mfa: !!a.TotpEnabled },
        };
    }
    async totpSetup(adminId, email) {
        const a = await dal.findById(adminId);
        if (!a) throw Error('Không tìm thấy tài khoản quản trị.');
        if (a.TotpEnabled) throw Error('2FA đã được bật. Hãy tắt trước nếu muốn tạo lại.');
        const secret = totp.generateSecret();
        await dal.saveTotp(adminId, secret, false);
        return { secret, otpauthUrl: totp.otpauthUrl(secret, email) };
    }
    async totpEnable(adminId, code) {
        const a = await dal.findById(adminId);
        if (!a || !a.TotpSecret) throw Error('Hãy bắt đầu thiết lập 2FA trước.');
        if (!totp.verify(a.TotpSecret, code)) throw Error('Mã xác thực không đúng.');
        await dal.saveTotp(adminId, a.TotpSecret, true);
    }
    async totpDisable(adminId, password, code) {
        const a = await dal.findById(adminId);
        if (!a || !a.TotpEnabled) throw Error('2FA chưa được bật.');
        if (!(await bcrypt.compare(String(password || ''), a.PasswordHash))) throw Error('Mật khẩu không đúng.');
        if (!totp.verify(a.TotpSecret, code)) throw Error('Mã xác thực không đúng.');
        await dal.saveTotp(adminId, null, false);
    }
    verifyToken(t) {
        const p = jwt.verify(t, SECRET);
        if (p.tokenType !== 'admin') throw Error('Token quản trị không hợp lệ.');
        return p;
    }
    getHomepageContent() {
        return dal.getHomepageContent();
    }
    saveHomepageContent(d) {
        return dal.saveHomepageContent(d);
    }
    stats() {
        return dal.stats();
    }
    dashboard() {
        return dal.dashboard();
    }
    bulkModerateProducts(ids, action, status, reason, adminEmail) {
        return dal.bulkModerateProducts(ids, action, status, reason, adminEmail);
    }
    getReports() {
        return dal.getReports();
    }
    updateReport(id, status, hide) {
        if (!Number.isInteger(id) || id < 1) throw Error('Mã báo cáo không hợp lệ.');
        return dal.updateReport(id, status, hide);
    }
}
module.exports = new B();
