/*
 * Thêm integrity (SRI) + crossorigin cho các thẻ <link>/<script> tải từ cdn.jsdelivr.net trong public/*.html.
 * Cần Internet (tải file từ CDN để tính hash).  Chạy:  npm run prepare:sri
 * Chạy lại mỗi khi đổi phiên bản thư viện. Nên tự host các file này nếu muốn không phụ thuộc CDN.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'public');
const TAG = /<(link|script)\b([^>]*?)(href|src)="(https:\/\/cdn\.jsdelivr\.net\/[^"]+)"([^>]*)>/g;
const cache = new Map();

async function hashOf(url) {
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Không tải được ${url}: HTTP ${response.status}`);
    const digest = crypto.createHash('sha384').update(Buffer.from(await response.arrayBuffer())).digest('base64');
    const value = `sha384-${digest}`;
    cache.set(url, value);
    return value;
}

(async () => {
    let changed = 0;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
        const full = path.join(dir, file);
        let html = fs.readFileSync(full, 'utf8');
        const matches = [...html.matchAll(TAG)];
        for (const m of matches) {
            const [whole, , before, , url, after] = m;
            if (/integrity=/.test(whole)) continue;
            const integrity = await hashOf(url);
            const replaced = whole.replace(`${m[3]}="${url}"`, `${m[3]}="${url}" integrity="${integrity}" crossorigin="anonymous"`);
            html = html.replace(whole, replaced);
            changed++;
        }
        fs.writeFileSync(full, html);
    }
    console.log(`Đã thêm SRI cho ${changed} thẻ.`);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
