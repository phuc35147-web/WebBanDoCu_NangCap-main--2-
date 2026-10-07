const nodemailer = require('nodemailer');

function createTransport() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 0);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    const from = String(process.env.SMTP_FROM || '').trim();

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
        const error = new Error(
            'Chưa cấu hình SMTP. Hãy điền SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS và SMTP_FROM trong .env.',
        );
        error.status = 503;
        throw error;
    }

    return {
        from,
        transporter: nodemailer.createTransport({
            host,
            port,
            secure: String(process.env.SMTP_SECURE || port === 465).toLowerCase() === 'true',
            auth: { user, pass },
        }),
    };
}

function isConfigured() {
    const port = Number(process.env.SMTP_PORT || 0);
    return !!(
        String(process.env.SMTP_HOST || '').trim() &&
        Number.isInteger(port) &&
        port >= 1 &&
        port <= 65535 &&
        String(process.env.SMTP_USER || '').trim() &&
        String(process.env.SMTP_PASS || '') &&
        String(process.env.SMTP_FROM || '').trim()
    );
}

// Chưa có SMTP và KHÔNG phải production: in mã OTP ra console để vẫn đăng ký / quên mật khẩu được khi phát triển.
// Ở production thì luôn bắt buộc SMTP (mã không bao giờ được trả về trong response).
function devFallback() {
    return !isConfigured() && String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
}

function assertConfigured() {
    if (devFallback()) return;
    createTransport();
}

async function sendOtp(email, code, purpose) {
    if (devFallback()) {
        console.log(`\n📧 [DEV] Chưa cấu hình SMTP nên không gửi email. Mã OTP (${purpose}) cho ${email}: ${code}\n`);
        return;
    }
    const { from, transporter } = createTransport();
    const registration = purpose === 'register';
    try {
        await transporter.sendMail({
            from,
            to: email,
            subject: registration ? 'Mã xác thực đăng ký Chợ Đồ Cũ' : 'Mã khôi phục mật khẩu Chợ Đồ Cũ',
            text: `Mã xác thực của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`,
            html: `<p>Mã xác thực của bạn:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>`,
        });
    } catch (error) {
        console.error('SMTP delivery failed:', error.message);
        const deliveryError = new Error('Không gửi được email lúc này. Vui lòng kiểm tra cấu hình SMTP và thử lại.');
        deliveryError.status = 502;
        throw deliveryError;
    }
}

module.exports = { sendOtp, assertConfigured, isConfigured, devFallback };
