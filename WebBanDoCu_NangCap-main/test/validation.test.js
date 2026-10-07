const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword } = require('../src/utils/passwordPolicy');
const { parsePrice, parseQuantity } = require('../src/utils/productInput');
const { adminPasswordProblems } = require('../src/config/startupChecks');
const totp = require('../src/utils/totp');

test('mật khẩu: tối thiểu 8 ký tự, có chữ và số, không phổ biến', () => {
    assert.ok(validatePassword('abc12'));
    assert.ok(validatePassword('abcdefgh'));
    assert.ok(validatePassword('12345678'));
    assert.ok(validatePassword('password123'));
    assert.ok(validatePassword('a'.repeat(73) + '1'));
    assert.equal(validatePassword('Tr0ngNha2026'), null);
});

test('mật khẩu: không trùng email / số điện thoại', () => {
    assert.ok(validatePassword('nguyenvan1', { email: 'nguyenvan1@gmail.com' }));
    assert.ok(validatePassword('0901234567', { phone: '0901234567' }));
});

test('mật khẩu admin mẫu bị chặn', () => {
    assert.ok(adminPasswordProblems('ChangeMe12345').length > 0);
    assert.ok(adminPasswordProblems('short1').length > 0);
    assert.equal(adminPasswordProblems('Kh0ngDoanDuoc-2026!').length, 0);
});

test('giá: chặn NaN, âm, 0, quá lớn; chấp nhận định dạng nghìn', () => {
    for (const bad of ['abc', '', '0', '-5', 'NaN', 'Infinity', '1e999', '9'.repeat(20), undefined, null])
        assert.throws(() => parsePrice(bad), /Giá/, `phải từ chối: ${bad}`);
    assert.equal(parsePrice('12500000'), 12500000);
    assert.equal(parsePrice('1.500.000'), 1500000);
});

test('số lượng: số nguyên 1..9999, mặc định 1', () => {
    assert.equal(parseQuantity(undefined), 1);
    assert.equal(parseQuantity('3'), 3);
    for (const bad of ['0', '-1', '1.5', 'abc', '100000']) assert.throws(() => parseQuantity(bad));
});

test('TOTP khớp vector chuẩn RFC 6238', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(totp.hotp(secret, Math.floor(59 / 30)), '287082');
    assert.equal(totp.verify(secret, '287082', 59_000), true);
    assert.equal(totp.verify(secret, '000000', 59_000), false);
});
