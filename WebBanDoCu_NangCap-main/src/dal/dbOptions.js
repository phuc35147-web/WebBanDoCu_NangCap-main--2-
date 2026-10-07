require('dotenv').config();

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const flag = (name, fallback) => {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : String(value).toLowerCase() === 'true';
};

/* Mã hóa kết nối: bật mặc định ở production (đặt DB_ENCRYPT=false để tắt khi DB nội bộ không có chứng chỉ) */
function buildConfig(credentials = {}) {
    return {
        user: credentials.user || process.env.DB_USER || 'sa',
        password: credentials.password ?? process.env.DB_PASSWORD ?? '',
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME || 'WebBanDoCu',
        port: Number(process.env.DB_PORT || 1433),
        options: {
            encrypt: flag('DB_ENCRYPT', isProduction),
            /* Production nên dùng chứng chỉ hợp lệ: đặt DB_TRUST_CERT=false */
            trustServerCertificate: flag('DB_TRUST_CERT', true),
            enableArithAbort: true,
        },
    };
}

module.exports = { buildConfig, flag, isProduction };
