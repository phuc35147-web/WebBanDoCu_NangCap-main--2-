const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpDAL = require('../dal/emailOtpDAL');
const users = require('../dal/nguoiDungDAL');
const emailService = require('../services/emailService');
const { userSecret } = require('../config/secrets');
const { assertStrongPassword } = require('../utils/passwordPolicy');

const purposes = new Set(['register', 'reset-password']);
const normalizeEmail = (email) =>
    String(email || '')
        .trim()
        .toLowerCase();
const otpHash = (email, purpose, code) =>
    crypto.createHmac('sha256', userSecret()).update(`${email}:${purpose}:${code}`).digest('hex');

class EmailOtpBLL {
    decode(token) {
        try {
            return jwt.verify(String(token || ''), userSecret());
        } catch (error) {
            throw new Error(
                error.name === 'TokenExpiredError'
                    ? 'Phiên xác thực email đã hết hạn. Vui lòng xác thực lại email.'
                    : 'Bạn chưa xác thực email hoặc phiên xác thực không hợp lệ. Vui lòng xác thực email trước.',
                { cause: error },
            );
        }
    }

    async send(emailInput, purpose) {
        const email = normalizeEmail(emailInput);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
            throw new Error('Email không hợp lệ.');
        }
        if (!purposes.has(purpose)) throw new Error('Mục đích xác thực không hợp lệ.');
        emailService.assertConfigured();

        const existing = await users.findByEmail(email);
        // Luôn trả cùng một thông báo dù email đã đăng ký hay chưa => không dò được danh sách email
        const sentMessage = 'Nếu email hợp lệ, mã xác thực sẽ được gửi đến email đó trong ít phút.';
        if (purpose === 'register' && existing) return { message: sentMessage };
        if (purpose === 'reset-password' && (!existing || !existing.TrangThai)) return { message: sentMessage };

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const otpId = await otpDAL.create(email, purpose, otpHash(email, purpose, code));
        try {
            await emailService.sendOtp(email, code, purpose);
        } catch (error) {
            await otpDAL.invalidate(otpId);
            throw error;
        }
        return { message: sentMessage };
    }

    async verify(emailInput, purpose, codeInput) {
        const email = normalizeEmail(emailInput);
        const code = String(codeInput || '').trim();
        if (!purposes.has(purpose) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Thông tin xác thực không hợp lệ.');
        }
        if (!/^\d{6}$/.test(code)) throw new Error('Mã xác thực phải gồm 6 chữ số.');

        const otpId = await otpDAL.verify(email, purpose, otpHash(email, purpose, code));
        const verificationToken = jwt.sign({ tokenType: 'email-otp', purpose, email, otpId }, userSecret(), {
            expiresIn: '10m',
        });
        return { verificationToken, message: 'Email đã được xác thực.' };
    }

    registrationOtpId(emailInput, token) {
        const email = normalizeEmail(emailInput);
        const payload = this.decode(token);
        if (
            payload.tokenType !== 'email-otp' ||
            payload.purpose !== 'register' ||
            payload.email !== email ||
            !Number.isInteger(payload.otpId)
        ) {
            throw new Error('Vui lòng xác thực email trước khi đăng ký.');
        }
        return payload.otpId;
    }

    async resetPassword(emailInput, token, newPassword) {
        const email = normalizeEmail(emailInput);
        assertStrongPassword(newPassword, { email });
        const payload = this.decode(token);
        if (
            payload.tokenType !== 'email-otp' ||
            payload.purpose !== 'reset-password' ||
            payload.email !== email ||
            !Number.isInteger(payload.otpId)
        ) {
            throw new Error('Vui lòng xác thực mã email trước khi đặt lại mật khẩu.');
        }
        const hash = await bcrypt.hash(String(newPassword), 12);
        await users.resetPassword(email, payload.otpId, hash);
        require('../middleware/security').clearUserStatusCache();
        return { message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' };
    }
}

module.exports = new EmailOtpBLL();
