/*
 * Quản lý JWT secret.
 * - Ưu tiên biến môi trường JWT_SECRET / ADMIN_JWT_SECRET (ít nhất 32 ký tự)
 * - Nếu chưa đặt: tự sinh ngẫu nhiên MỘT LẦN và lưu vào file .jwt-secret (đã .gitignore)
 *   để token không bị mất mỗi lần restart và không còn secret mặc định công khai trong mã nguồn.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', '.jwt-secret');
let cached = null;

function loadOrCreate() {
    if (cached) return cached;

    const fromEnv = String(process.env.JWT_SECRET || '').trim();
    // Bỏ qua giá trị mẫu trong .env.example (đã công khai) để không vô tình dùng làm khóa thật
    if (fromEnv.length >= 32 && !/replace-with|changeme|your[-_ ]?secret|example/i.test(fromEnv)) {
        cached = fromEnv;
        return cached;
    }

    if (fs.existsSync(FILE)) {
        let saved;
        try {
            saved = fs.readFileSync(FILE, 'utf8').trim();
        } catch (error) {
            throw new Error(
                `Không thể đọc khóa JWT tại ${FILE}. Hãy kiểm tra quyền truy cập file hoặc đặt JWT_SECRET trong .env.`,
                { cause: error },
            );
        }
        if (saved.length >= 32) {
            cached = saved;
            return cached;
        }
        throw new Error(`Khóa JWT trong ${FILE} không hợp lệ. Hãy xóa file này hoặc đặt JWT_SECRET trong .env.`);
    }

    cached = crypto.randomBytes(48).toString('hex');
    try {
        fs.writeFileSync(FILE, cached, { flag: 'wx', mode: 0o600 });
    } catch (error) {
        cached = null;
        if (error.code === 'EEXIST') return loadOrCreate();
        throw new Error(`Không thể lưu khóa JWT tại ${FILE}. Hãy kiểm tra quyền ghi hoặc đặt JWT_SECRET trong .env.`, {
            cause: error,
        });
    }
    console.warn(
        '⚠️  Chưa có JWT_SECRET trong .env, đã tự sinh khóa riêng. Nên đặt JWT_SECRET (>=32 ký tự) khi triển khai thật.',
    );
    return cached;
}

function userSecret() {
    return loadOrCreate();
}

function adminSecret() {
    const fromEnv = String(process.env.ADMIN_JWT_SECRET || '').trim();
    if (fromEnv.length >= 32 && !/replace-with|changeme|your[-_ ]?secret|example/i.test(fromEnv)) return fromEnv;
    return crypto
        .createHash('sha256')
        .update(loadOrCreate() + ':admin')
        .digest('hex');
}

module.exports = { userSecret, adminSecret };
