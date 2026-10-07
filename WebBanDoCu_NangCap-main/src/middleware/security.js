const fs = require('fs');
const AppError = require('../errors/AppError');

/*
 * ===== Header bảo mật =====
 * CSP: giới hạn nguồn script/style/ảnh/kết nối. Hiện các trang còn dùng script và onclick nội tuyến nên
 * script-src vẫn cần 'unsafe-inline'; khi đã chuyển hết sang file .js riêng thì bỏ 'unsafe-inline' để CSP phát huy tối đa.
 */
const CDN = 'https://cdn.jsdelivr.net';
const CSP = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${CDN}`,
    `style-src 'self' 'unsafe-inline' ${CDN}`,
    `font-src 'self' ${CDN} data:`,
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://provinces.open-api.vn",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
].join('; ');

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    // HSTS chỉ có ý nghĩa qua HTTPS; chỉ gửi ở production và khi request thực sự là HTTPS
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

/* ===== Giới hạn tần suất (in-memory, không cần thư viện ngoài) ===== */
function rateLimit({ windowMs, max, message, key }) {
    const hits = new Map();

    const timer = setInterval(
        () => {
            const now = Date.now();
            for (const [k, v] of hits) {
                if (v.reset <= now) hits.delete(k);
            }
        },
        Math.min(windowMs, 60000),
    );
    if (timer.unref) timer.unref();

    return (req, res, next) => {
        const id = (key ? key(req) : req.ip) || req.ip || 'unknown';
        const now = Date.now();
        let entry = hits.get(id);

        if (!entry || entry.reset <= now) {
            entry = { count: 0, reset: now + windowMs };
            hits.set(id, entry);
        }

        entry.count += 1;

        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
            return res.status(429).json({
                message: message || 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
            });
        }

        next();
    };
}

/* ===== Kiểm tra file ảnh thật bằng magic bytes (mimetype do client tự khai nên không đủ tin cậy) ===== */
function detectImageType(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP')
        return 'image/webp';
    return null;
}

function collectFiles(req) {
    const list = [];
    if (req.file) list.push(req.file);
    if (Array.isArray(req.files)) list.push(...req.files);
    else if (req.files && typeof req.files === 'object') {
        for (const arr of Object.values(req.files)) list.push(...arr);
    }
    return list;
}

function removeFiles(files) {
    for (const f of files) {
        fs.unlink(f.path, (error) => {
            if (error && error.code !== 'ENOENT') {
                console.error(`Không thể xóa file upload ${f.path}:`, error);
            }
        });
    }
}

function cleanupUploadsOnError(req, res, next) {
    res.once('finish', () => {
        if (res.statusCode >= 400) removeFiles(collectFiles(req));
    });
    next();
}

function validateUploadedImages(req, res, next) {
    const files = collectFiles(req);

    for (const f of files) {
        const head = Buffer.alloc(16);
        let fd;
        try {
            fd = fs.openSync(f.path, 'r');
            fs.readSync(fd, head, 0, 16, 0);
        } catch (error) {
            removeFiles(files);
            return next(new AppError('Không thể kiểm tra file ảnh đã tải lên.', 500, { cause: error }));
        } finally {
            if (fd !== undefined) fs.closeSync(fd);
        }

        if (!detectImageType(head)) {
            removeFiles(files);
            return next(new AppError('File tải lên không phải ảnh JPG, PNG hoặc WEBP hợp lệ.', 400));
        }
    }

    next();
}

const EXT_BY_MIME = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

/* ===== Lấy người xem (nếu có token) mà không bắt buộc đăng nhập ===== */
function optionalViewer(req, res, next) {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
        const token = h.slice(7);
        try {
            req.user = require('../bll/nguoiDungBLL').verifyToken(token);
        } catch (_) {
            try {
                req.admin = require('../bll/adminBLL').verifyToken(token);
            } catch (_) {
                // Public routes must remain available when an optional token is invalid or expired.
            }
        }
    }
    next();
}

/* ===== Kiểm tra phiên: tài khoản bị khóa hoặc đã đổi mật khẩu thì token cũ mất hiệu lực (cache 30s) ===== */
const statusCache = new Map();
const STATUS_TTL = 30000;

async function sessionInfo(id) {
    const hit = statusCache.get(id);
    if (hit && hit.exp > Date.now()) return hit.info;
    const { poolPromise, sql } = require('../dal/dbConfig');
    const pool = await poolPromise;
    const r = await pool
        .request()
        .input('id', sql.Int, id)
        .query('SELECT TrangThai, VaiTro, PasswordChangedAt FROM NguoiDung WHERE MaNguoiDung=@id');
    // Không tìm thấy (ví dụ DB vừa reset): để các lớp phía sau tự xử lý như cũ
    const row = r.recordset[0];
    const info = {
        exists: !!row,
        role: row ? row.VaiTro : null,
        active: row ? !!row.TrangThai : true,
        changedAt: row && row.PasswordChangedAt ? new Date(row.PasswordChangedAt).getTime() : null,
    };
    statusCache.set(id, { info, exp: Date.now() + STATUS_TTL });
    return info;
}

async function isActiveUser(id) {
    return (await sessionInfo(id)).active;
}

function invalidateUserStatus(id) {
    statusCache.delete(Number(id));
}

function clearUserStatusCache() {
    statusCache.clear();
}

/* ===== Resize + xóa EXIF (GPS, thiết bị...) khi upload. Cần thư viện `sharp` (npm install) ===== */
let sharpLib;
function getSharp() {
    if (sharpLib === undefined) {
        try {
            sharpLib = require('sharp');
        } catch (_) {
            sharpLib = null;
            console.warn(
                '⚠️  Chưa cài `sharp`: ảnh upload KHÔNG được xóa EXIF/resize. Chạy `npm install` để bật tính năng này.',
            );
        }
    }
    return sharpLib;
}

const MAX_IMAGE_SIDE = 1600;

async function processUploadedImages(req, res, next) {
    const files = collectFiles(req);
    if (!files.length) return next();
    const sharp = getSharp();
    if (!sharp) return next();
    try {
        for (const file of files) {
            const tmp = `${file.path}.tmp`;
            const ext = require('path').extname(file.path).toLowerCase();
            let pipeline = sharp(file.path, { failOn: 'error' })
                .rotate() // áp dụng hướng xoay từ EXIF rồi bỏ EXIF
                .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
            if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
            else if (ext === '.webp') pipeline = pipeline.webp({ quality: 82 });
            else pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
            const info = await pipeline.toFile(tmp);
            await fs.promises.rename(tmp, file.path);
            file.size = info.size;
        }
        next();
    } catch (error) {
        removeFiles(files);
        next(new AppError('Không xử lý được ảnh tải lên. Vui lòng chọn ảnh khác.', 400, { cause: error }));
    }
}

/* ===== Admin: kiểm tra lại với DB (tài khoản bị khóa / hạ quyền / đổi mật khẩu thì token cũ mất hiệu lực) ===== */
async function assertAdminSession(payload) {
    const id = Number(payload && payload.adminId);
    if (!Number.isInteger(id) || id < 1) throw new AppError('Phiên quản trị không hợp lệ.', 403);
    const sess = await sessionInfo(id);
    if (!sess.exists || sess.role !== 'admin' || !sess.active)
        throw new AppError('Tài khoản quản trị đã bị khóa hoặc không còn quyền.', 403);
    if (sess.changedAt && Number(payload.iat || 0) < Math.floor(sess.changedAt / 1000))
        throw new AppError('Mật khẩu đã thay đổi. Vui lòng đăng nhập quản trị lại.', 401);
}

/* ===== Chống tăng lượt xem ảo: mỗi (tin, người xem) chỉ tính 1 lượt / 30 phút ===== */
const viewSeen = new Map();
const VIEW_TTL = 30 * 60 * 1000;
function shouldCountView(productId, viewerKey) {
    const now = Date.now();
    if (viewSeen.size > 20000) {
        for (const [k, exp] of viewSeen) if (exp <= now) viewSeen.delete(k);
        if (viewSeen.size > 20000) viewSeen.clear();
    }
    const key = `${productId}:${viewerKey}`;
    const exp = viewSeen.get(key);
    if (exp && exp > now) return false;
    viewSeen.set(key, now + VIEW_TTL);
    return true;
}

module.exports = {
    securityHeaders,
    rateLimit,
    cleanupUploadsOnError,
    validateUploadedImages,
    detectImageType,
    EXT_BY_MIME,
    optionalViewer,
    isActiveUser,
    sessionInfo,
    invalidateUserStatus,
    clearUserStatusCache,
    processUploadedImages,
    assertAdminSession,
    shouldCountView,
    removeFiles,
    collectFiles,
};
