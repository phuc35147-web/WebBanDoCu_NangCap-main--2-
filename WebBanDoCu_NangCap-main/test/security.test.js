const test = require('node:test');
const assert = require('node:assert/strict');
const security = require('../src/middleware/security');

test('detectImageType nhận đúng JPG/PNG/WEBP và từ chối file giả', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    assert.equal(security.detectImageType(jpg), 'image/jpeg');
    assert.equal(security.detectImageType(png), 'image/png');
    assert.equal(security.detectImageType(webp), 'image/webp');
    assert.equal(security.detectImageType(Buffer.from('<script>alert(1)</script>')), null);
});

test('lượt xem: cùng người xem chỉ tính một lần trong 30 phút', () => {
    assert.equal(security.shouldCountView(1, 'u1'), true);
    assert.equal(security.shouldCountView(1, 'u1'), false);
    assert.equal(security.shouldCountView(1, 'u2'), true);
    assert.equal(security.shouldCountView(2, 'u1'), true);
});

test('rate limit theo khóa tùy chọn', () => {
    const limiter = security.rateLimit({ windowMs: 1000, max: 2, key: (req) => req.k });
    const run = (k) => {
        let status = 200;
        const res = { setHeader() {}, status(s) { status = s; return this; }, json() {} };
        limiter({ k, ip: '1.1.1.1' }, res, () => {});
        return status;
    };
    assert.equal(run('a'), 200);
    assert.equal(run('a'), 200);
    assert.equal(run('a'), 429);
    assert.equal(run('b'), 200);
});

test('CSP và header bảo mật được gửi', () => {
    const headers = {};
    security.securityHeaders({ headers: {} }, { setHeader: (k, v) => (headers[k] = v) }, () => {});
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});
