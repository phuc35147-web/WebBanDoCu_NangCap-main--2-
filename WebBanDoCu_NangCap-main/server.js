require('dotenv').config();

require('./src/config/startupChecks').runStartupChecks();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { poolPromise } = require('./src/dal/dbConfig');

const auth = require('./src/controllers/authController');
const product = require('./src/controllers/productController');
const account = require('./src/controllers/accountController');
const admin = require('./src/controllers/adminController');
const message = require('./src/controllers/messageController');
const extra = require('./src/controllers/extraController');
const security = require('./src/middleware/security');
const AppError = require('./src/errors/AppError');
const { poolPromise: dbPool, sql } = require('./src/dal/dbConfig');

const app = express();
app.disable('x-powered-by');
const trustProxy = String(process.env.TRUST_PROXY || '').trim();
if (trustProxy && trustProxy !== 'false') {
    app.set(
        'trust proxy',
        trustProxy === 'true'
            ? true
            : /^\d+$/.test(trustProxy)
              ? Number(trustProxy)
              : trustProxy.split(',').map((value) => value.trim()),
    );
}

const PORT = Number(process.env.PORT || 5000);

const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(__dirname, 'uploads');

/* =========================
   TẠO THƯ MỤC UPLOAD
========================= */

const chatUploadDir = message.CHAT_DIR;
const thumbDir = path.join(uploadDir, '.thumbs');
for (const dir of [uploadDir, chatUploadDir, thumbDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* =========================
   MULTER
========================= */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const ext = security.EXT_BY_MIME[file.mimetype] || '.jpg';

        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    },
});

function imageFileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(Object.assign(new Error('Chỉ được upload ảnh JPG, JPEG, PNG hoặc WEBP.'), { status: 400 }));
    }
}

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter: imageFileFilter,
});

/* Ảnh chat: lưu ngoài /uploads (không public), chỉ người trong cuộc xem được qua /api/messages/files/:name */
const chatUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, chatUploadDir),
        filename: (req, file, cb) => {
            const ext = security.EXT_BY_MIME[file.mimetype] || '.jpg';
            cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: imageFileFilter,
});

/* =========================
   MIDDLEWARE
========================= */

app.use(security.securityHeaders);
app.use(security.cleanupUploadsOnError);
/* CORS: frontend và API cùng một origin nên mặc định KHÔNG bật CORS. Chỉ bật cho các domain khai báo trong CORS_ORIGINS. */
const corsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
if (corsOrigins.length) {
    app.use(
        cors({
            origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
            credentials: false,
            exposedHeaders: ['X-Total-Count'],
        }),
    );
}

/* ===== Giới hạn tần suất chống dò mật khẩu / spam ===== */
const onlyPost = (limiter) => (req, res, next) => (req.method === 'POST' ? limiter(req, res, next) : next());
app.use(
    '/api/auth/login',
    security.rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: 'Bạn đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    }),
);
app.use(
    '/api/auth/register',
    security.rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10,
        message: 'Bạn đăng ký quá nhiều lần. Vui lòng thử lại sau.',
    }),
);
app.use('/api/auth/check-phone', security.rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }));
app.use(
    '/api/auth/email-otp/send',
    security.rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 8,
        message: 'Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau.',
    }),
);
app.use(
    '/api/auth/email-otp/verify',
    security.rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        message: 'Bạn nhập mã quá nhiều lần. Vui lòng thử lại sau.',
    }),
);
app.use(
    '/api/auth/password-reset',
    security.rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: 'Bạn đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau.',
    }),
);
app.use(
    '/api/admin/auth/login',
    security.rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: 'Đăng nhập quản trị sai quá nhiều lần. Vui lòng thử lại sau.',
    }),
);
app.use(
    '/api/messages',
    onlyPost(security.rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Bạn gửi tin nhắn quá nhanh.' })),
);
app.use(
    '/api/products',
    onlyPost(
        security.rateLimit({
            windowMs: 60 * 60 * 1000,
            max: 60,
            message: 'Bạn thao tác đăng/báo cáo quá nhiều. Vui lòng thử lại sau.',
        }),
    ),
);

app.use(express.json({ limit: '100kb' }));

app.use(
    express.urlencoded({
        extended: true,
        limit: '100kb',
    }),
);

/*
 * File tĩnh trong /public (extensions:['html'] để /terms mở được terms.html).
 */
app.use(express.static(publicDir, { extensions: ['html'] }));

/* Đường dẫn ngắn / dễ nhớ cho các trang pháp lý */
const legalRoutes = {
    '/dieu-khoan': '/terms.html',
    '/chinh-sach-bao-mat': '/privacy.html',
    '/quy-che-hoat-dong': '/regulations.html',
    '/lien-he': '/contact.html',
};
for (const [from, to] of Object.entries(legalRoutes)) app.get(from, (req, res) => res.redirect(301, to));

/*
 * Ảnh thu nhỏ cho trang danh sách: /uploads/t/<tên file> (480px, WebP, có cache trên đĩa).
 * Chưa cài `sharp` thì chuyển hướng về ảnh gốc.
 */
app.get('/uploads/t/:name', async (req, res) => {
    const name = String(req.params.name || '');
    if (!/^[\w.-]+\.(jpg|png|webp)$/i.test(name)) return res.status(404).send('Not found');
    const source = path.join(uploadDir, name);
    if (!fs.existsSync(source)) return res.status(404).send('Not found');
    let sharp;
    try {
        sharp = require('sharp');
    } catch (_) {
        return res.redirect(302, `/uploads/${encodeURIComponent(name)}`);
    }
    const target = path.join(thumbDir, `${name}.webp`);
    try {
        if (!fs.existsSync(target)) {
            await sharp(source).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(target);
        }
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.sendFile(target, { dotfiles: 'allow' });
    } catch (error) {
        console.error('Không tạo được ảnh thu nhỏ:', error);
        res.redirect(302, `/uploads/${encodeURIComponent(name)}`);
    }
});

/*
 * Thư mục upload công khai (ảnh tin đăng, banner). Ảnh chat KHÔNG nằm ở đây.
 */
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', index: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

/* =========================
   SEO: robots.txt + sitemap.xml
========================= */
function siteOrigin(req) {
    const configured = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
    return configured || `${req.protocol}://${req.get('host')}`;
}

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
        [
            'User-agent: *',
            'Disallow: /api/',
            'Disallow: /admin',
            'Disallow: /account.html',
            'Disallow: /messages.html',
            `Sitemap: ${siteOrigin(req)}/sitemap.xml`,
            '',
        ].join('\n'),
    );
});

let sitemapCache = { xml: '', exp: 0 };
app.get('/sitemap.xml', async (req, res, next) => {
    try {
        const origin = siteOrigin(req);
        if (sitemapCache.exp > Date.now() && sitemapCache.origin === origin) return res.type('application/xml').send(sitemapCache.xml);
        const pool = await dbPool;
        const rows = (
            await pool
                .request()
                .query(
                    `SELECT TOP 5000 MaSanPham,COALESCE(NgayCapNhat,NgayDang) AS Moi FROM SanPhamDoCu WHERE TrangThai=N'Đang bán' ORDER BY COALESCE(NgayDayTin,NgayDang) DESC`,
                )
        ).recordset;
        const urls = [
            { loc: `${origin}/`, freq: 'daily' },
            ...['terms', 'privacy', 'regulations', 'contact'].map((page) => ({ loc: `${origin}/${page}.html`, freq: 'yearly' })),
            ...rows.map((row) => ({
                loc: `${origin}/product-detail.html?id=${row.MaSanPham}`,
                freq: 'weekly',
                mod: row.Moi ? new Date(row.Moi).toISOString().slice(0, 10) : '',
            })),
        ];
        const xml =
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            urls
                .map(
                    (u) =>
                        `  <url><loc>${u.loc.replace(/&/g, '&amp;')}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq></url>`,
                )
                .join('\n') +
            '\n</urlset>\n';
        sitemapCache = { xml, exp: Date.now() + 60 * 60 * 1000, origin };
        res.type('application/xml').send(xml);
    } catch (error) {
        next(error);
    }
});

/* =========================
   TEST SERVER
========================= */

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        database: process.env.DB_NAME || 'WebBanDoCu',
        time: new Date().toISOString(),
    });
});

/* =========================
   AUTH
========================= */

app.post('/api/auth/register', auth.register);

app.post('/api/auth/login', auth.login);

app.post('/api/auth/check-phone', auth.checkPhone);

app.post('/api/auth/email-otp/send', auth.sendEmailOtp);
app.post('/api/auth/email-otp/verify', auth.verifyEmailOtp);
app.post('/api/auth/password-reset', auth.resetPassword);

app.post('/api/admin/auth/login', auth.adminLogin);

/* =========================
   ACCOUNT
========================= */

app.get('/api/account', auth.verifyTokenMiddleware, account.getAccount);

app.get('/api/account/profile', auth.verifyTokenMiddleware, account.getAccount);

app.put('/api/account', auth.verifyTokenMiddleware, account.updateAccount);

app.get('/api/account/listings', auth.verifyTokenMiddleware, account.getListings);

/* =========================
   CHAT GIỮA NGƯỜI MUA / NGƯỜI BÁN
========================= */
app.get('/api/messages/conversations', auth.verifyTokenMiddleware, message.conversations);
app.get('/api/messages/stream', auth.verifyTokenMiddleware, message.stream);
app.get('/api/messages/:id/presence', auth.verifyTokenMiddleware, message.presence);
app.get('/api/messages', auth.verifyTokenMiddleware, message.conversation);
app.get('/api/messages/files/:name', auth.verifyTokenMiddleware, message.chatFile);
app.post(
    '/api/messages',
    auth.verifyTokenMiddleware,
    // Giới hạn theo TÀI KHOẢN (ngoài giới hạn theo IP ở trên): 40 tin / phút / người dùng
    security.rateLimit({
        windowMs: 60 * 1000,
        max: 40,
        key: (req) => 'msg:' + (req.user && req.user.id),
        message: 'Bạn gửi tin nhắn quá nhanh. Vui lòng chậm lại.',
    }),
    chatUpload.single('image'),
    security.validateUploadedImages,
    security.processUploadedImages,
    message.send,
);
app.patch('/api/messages/read', auth.verifyTokenMiddleware, message.read);

require('./src/routes/community')(app, { auth });

/* =========================
   PRODUCTS
========================= */

app.get('/api/categories', product.getCategories);

app.get('/api/products', product.getProducts);

app.get('/api/products/:id', security.optionalViewer, product.getProductById);

app.post('/api/products/:id/reviews', auth.verifyTokenMiddleware, product.review);
app.post('/api/products/:id/reports', auth.verifyTokenMiddleware, product.report);

app.post(
    '/api/products',
    auth.verifyTokenMiddleware,
    upload.fields([
        { name: 'hinhAnh', maxCount: 1 },
        { name: 'hinhAnhs', maxCount: 8 },
    ]),
    security.validateUploadedImages,
    security.processUploadedImages,
    product.createProduct,
);

app.patch(
    '/api/products/:id',
    auth.verifyTokenMiddleware,
    upload.fields([
        { name: 'hinhAnh', maxCount: 1 },
        { name: 'hinhAnhs', maxCount: 8 },
    ]),
    security.validateUploadedImages,
    security.processUploadedImages,
    product.updateProduct,
);

app.delete('/api/products/:id', auth.verifyTokenMiddleware, product.deleteProduct);

/* =========================
   ADMIN
========================= */

app.get('/api/admin/products', auth.verifyAdminMiddleware, admin.getProducts);

app.patch(
    '/api/admin/products/:id/status',
    auth.verifyAdminMiddleware,
    extra.logAfter('Đổi trạng thái tin đăng', 'SanPhamDoCu', (req) =>
        `${req.body.trangThai || ''} ${req.body.lyDoTuChoi || ''}`.trim(),
    ),
    admin.updateProductStatus,
);

app.get('/api/admin/reports', auth.verifyAdminMiddleware, admin.getReports);
app.patch(
    '/api/admin/reports/:id',
    auth.verifyAdminMiddleware,
    extra.logAfter(
        'Xử lý báo cáo',
        'BaoCaoSanPham',
        (req) => `${req.body.trangThai || ''}${req.body.anTin === true ? ' + ẩn tin' : ''}`,
    ),
    admin.updateReport,
);

app.get('/api/admin/stats', auth.verifyAdminMiddleware, admin.stats);

/* =========================
   TÍNH NĂNG MỚI: yêu thích, thông báo, hồ sơ người bán,
   đã bán, đẩy tin, đổi mật khẩu, quản lý người dùng, nhật ký admin
========================= */
require('./src/routes/extra')(app, { auth });

/* =========================
   HOMEPAGE
========================= */

app.get('/api/homepage-content', admin.getHomepageContent);

app.put(
    '/api/admin/homepage-content',
    auth.verifyAdminMiddleware,
    upload.single('image'),
    security.validateUploadedImages,
    security.processUploadedImages,
    extra.logAfter('Cập nhật nội dung trang chủ', 'HomepageContent'),
    admin.updateHomepageContent,
);

/* ĐÃ XÓA: /api/config/maps (trước đây trả công khai GOOGLE_MAPS_API_KEY). Key chỉ dùng phía server để geocode. */

/* =========================
   ERROR
========================= */

app.use((err, req, res, next) => {
    let appError;
    if (err instanceof multer.MulterError) {
        const msg =
            err.code === 'LIMIT_FILE_SIZE' ? 'Mỗi ảnh tối đa 5MB.' : 'Tải ảnh không hợp lệ (tối đa 8 ảnh mỗi tin).';
        appError = new AppError(msg, 400, { cause: err });
    } else {
        appError = AppError.from(err);
    }

    if (appError.statusCode >= 500) {
        console.error(err);
    }

    res.status(appError.statusCode).json({
        message: appError.statusCode < 500 ? appError.message : 'Lỗi máy chủ.',
        detail: process.env.NODE_ENV === 'development' && appError.statusCode >= 500 ? appError.message : undefined,
    });
});

/* =========================
   TRANG SPA FALLBACK
========================= */

/*
 * ĐẶT CUỐI CÙNG
 */
// API không tồn tại phải trả JSON 404 chứ không trả trang chủ
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'Không tìm thấy API.' });
});

app.get('*', (req, res) => {
    // File tĩnh không tồn tại (có đuôi .js/.css/.png...) trả 404 thay vì trang chủ
    if (path.extname(req.path)) {
        return res.status(404).send('Not found');
    }

    res.sendFile(path.join(publicDir, 'index.html'));
});

/* =========================
   START SERVER
========================= */

poolPromise
    .then(() => {
        app.listen(PORT, () => {
            console.log('');
            console.log('🚀 Chợ Đồ Cũ: http://localhost:' + PORT);
            console.log('📦 Database: ' + (process.env.DB_NAME || 'WebBanDoCu'));
            console.log('');
        });
    })
    .catch((error) => {
        console.error('❌ Không thể khởi động server do lỗi cơ sở dữ liệu:', error);
        process.exitCode = 1;
    });
