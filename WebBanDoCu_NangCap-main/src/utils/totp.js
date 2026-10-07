/* TOTP (RFC 6238) tự cài bằng crypto của Node, tương thích Google Authenticator / Authy / 1Password */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(text) {
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of String(text).replace(/=+$/, '').toUpperCase()) {
        const index = ALPHABET.indexOf(char);
        if (index < 0) continue;
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function generateSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const code =
        ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(code % 1_000_000).padStart(6, '0');
}

/* Chấp nhận lệch ±1 bước 30 giây */
function verify(secret, code, now = Date.now()) {
    const input = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(input) || !secret) return false;
    const step = Math.floor(now / 30000);
    for (let w = -1; w <= 1; w++) {
        const expected = hotp(secret, step + w);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input))) return true;
    }
    return false;
}

function otpauthUrl(secret, account, issuer = 'Cho Do Cu') {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

module.exports = { generateSecret, verify, otpauthUrl, hotp };
