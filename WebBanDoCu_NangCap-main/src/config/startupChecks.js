/*
 * Kiểm tra cấu hình khi khởi động.
 * - Production: cấu hình nguy hiểm sẽ làm server từ chối chạy.
 * - Môi trường khác: chỉ cảnh báo.
 */
const { validatePassword } = require('../utils/passwordPolicy');

const SAMPLE_PATTERN = /replace-with|changeme|change-me|your[-_ ]?(secret|password)|example|password|admin123|12345/i;

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

function isSampleSecret(value) {
    return SAMPLE_PATTERN.test(String(value || ''));
}

/* Trả về danh sách vấn đề của mật khẩu admin (rỗng nếu ổn) */
function adminPasswordProblems(password) {
    const problems = [];
    const value = String(password || '');
    if (value.length < 12) problems.push('ngắn hơn 12 ký tự');
    if (isSampleSecret(value)) problems.push('là mật khẩu mẫu công khai trong .env.example');
    const policy = validatePassword(value);
    if (policy) problems.push(policy.toLowerCase());
    return problems;
}

function runStartupChecks() {
    const prod = isProduction();
    const errors = [];
    const warnings = [];

    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const problems = adminPasswordProblems(process.env.ADMIN_PASSWORD);
        if (problems.length) {
            const message = `ADMIN_PASSWORD không đạt yêu cầu (${problems.join('; ')}). Hãy đặt mật khẩu admin mạnh, tối thiểu 12 ký tự.`;
            (prod ? errors : warnings).push(message);
        }
    }

    if (String(process.env.SEED_DEMO || '').toLowerCase() === 'true' && prod) {
        errors.push('SEED_DEMO=true không được phép ở production (sẽ tạo tài khoản demo mật khẩu 123456).');
    }

    if (prod) {
        const jwt = String(process.env.JWT_SECRET || '').trim();
        if (jwt.length < 32 || isSampleSecret(jwt)) errors.push('JWT_SECRET phải đặt riêng, tối thiểu 32 ký tự ngẫu nhiên.');
        const adminJwt = String(process.env.ADMIN_JWT_SECRET || '').trim();
        if (adminJwt && (adminJwt.length < 32 || isSampleSecret(adminJwt)))
            errors.push('ADMIN_JWT_SECRET (nếu đặt) phải tối thiểu 32 ký tự ngẫu nhiên.');

        const proxy = String(process.env.TRUST_PROXY || '').trim();
        if (!proxy || proxy === 'false')
            warnings.push(
                'TRUST_PROXY chưa đặt. Nếu chạy sau Nginx/Cloudflare/PaaS, mọi người dùng sẽ bị tính chung một IP và dùng chung giới hạn tần suất. Đặt TRUST_PROXY=1 (số lớp proxy) khi có reverse proxy.',
            );
        if (String(process.env.DB_ENCRYPT || '').toLowerCase() === 'false')
            warnings.push('DB_ENCRYPT=false: kết nối tới SQL Server không được mã hóa.');
        if (String(process.env.AUTO_MIGRATE || '').toLowerCase() === 'true')
            warnings.push('AUTO_MIGRATE=true ở production: tài khoản DB của ứng dụng cần quyền DDL. Nên chạy `npm run migrate` bằng tài khoản riêng.');
        if (!String(process.env.CORS_ORIGINS || '').trim())
            warnings.push('CORS_ORIGINS chưa đặt: API chỉ nhận request cùng origin (an toàn). Chỉ đặt khi có frontend ở domain khác.');
    }

    for (const warning of warnings) console.warn('⚠️  ' + warning);
    if (errors.length) {
        for (const error of errors) console.error('❌ ' + error);
        throw new Error('Cấu hình không an toàn cho production. Xem các lỗi ở trên.');
    }
}

module.exports = { runStartupChecks, adminPasswordProblems, isProduction, isSampleSecret };
