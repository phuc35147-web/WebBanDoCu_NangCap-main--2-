/*
 * Hiển thị lịch sử chat: nhóm tin liên tiếp, ảnh (riêng tư), thẻ trả giá, link, cảnh báo lừa đảo.
 * Tách khỏi messages.js cho gọn. Toàn bộ nội dung người dùng đều được escape trước khi chèn vào HTML.
 */
(function () {
    'use strict';

    const GROUP_GAP_MS = 5 * 60 * 1000;
    const esc = (v) =>
        String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const money = (v) => Number(v || 0).toLocaleString('vi-VN') + ' đ';
    const initial = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();

    /* ---------- loại tin ---------- */
    const IMAGE_PATH = /^\/(api\/messages\/files|uploads)\/[\w.-]+$/;
    function kindOf(m) {
        const type = String(m.LoaiTinNhan || '').toLowerCase();
        if (type === 'offer' && Number(m.GiaDeXuat) > 0) return 'offer';
        if (type === 'image' || (!type && IMAGE_PATH.test(String(m.NoiDung || '')))) return 'image';
        return 'text';
    }

    /* Nội dung ngắn gọn cho danh sách cuộc trò chuyện */
    function preview(item) {
        const text = String(item.NoiDung || '');
        if (!text) return 'Chưa có tin nhắn';
        const kind = kindOf(item);
        if (kind === 'image') return '📷 Hình ảnh';
        if (kind === 'offer') return '💰 Đề nghị giá ' + money(item.GiaDeXuat);
        return text;
    }

    /* ---------- link + xuống dòng ---------- */
    const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/gi;
    function linkify(text) {
        return esc(text)
            .replace(URL_RE, (url) => {
                const clean = url.replace(/&amp;/g, '&');
                return `<a href="${esc(clean)}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
            })
            .replace(/\n/g, '<br>');
    }

    /* ---------- cảnh báo lừa đảo ---------- */
    function scamHint(text) {
        const t = String(text || '').toLowerCase();
        const hasBankWord = /(stk|số tài khoản|so tai khoan|chuyển khoản|chuyen khoan|đặt cọc|dat coc|ck trước|ck truoc|ship cod|momo|zalopay)/.test(t);
        const hasLongNumber = (t.match(/\d[\d\s.-]{7,}\d/g) || []).some((n) => n.replace(/\D/g, '').length >= 9);
        const links = t.match(URL_RE) || [];
        const strangeLink = links.some((u) => {
            try {
                return new URL(u).host !== location.host;
            } catch (_) {
                return true;
            }
        });
        if ((hasBankWord && hasLongNumber) || /đặt cọc|dat coc|chuyển khoản trước|chuyen khoan truoc/.test(t))
            return 'Cẩn thận: không chuyển tiền đặt cọc hoặc chuyển khoản trước khi nhận và kiểm tra hàng.';
        if (strangeLink) return 'Link bên ngoài có thể không an toàn. Đừng nhập mật khẩu, OTP hay thông tin thẻ.';
        return '';
    }

    /* ---------- ảnh riêng tư: tải bằng fetch kèm token rồi gắn blob ---------- */
    const blobCache = new Map();
    async function secureBlob(src) {
        if (blobCache.has(src)) return blobCache.get(src);
        const task = fetch(src, { headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') } })
            .then((r) => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.blob();
            })
            .then((b) => URL.createObjectURL(b));
        blobCache.set(src, task);
        task.catch(() => blobCache.delete(src));
        return task;
    }
    function hydrateImages(root) {
        (root || document).querySelectorAll('img[data-secure-src]').forEach(async (img) => {
            const src = img.dataset.secureSrc;
            img.removeAttribute('data-secure-src');
            try {
                img.src = await secureBlob(src);
                img.closest('.msg-image')?.classList.add('loaded');
            } catch (_) {
                img.closest('.msg-image')?.classList.add('failed');
            }
        });
    }

    /* ---------- xem ảnh lớn ---------- */
    function openLightbox(src) {
        const box = document.createElement('div');
        box.className = 'chat-lightbox';
        box.innerHTML = `<button type="button" aria-label="Đóng"><i class="bi bi-x-lg"></i></button><img alt="Ảnh trong tin nhắn" src="${esc(src)}">`;
        const close = () => {
            box.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => e.key === 'Escape' && close();
        box.addEventListener('click', (e) => (e.target === box || e.target.closest('button')) && close());
        document.addEventListener('keydown', onKey);
        document.body.appendChild(box);
    }
    document.addEventListener('click', (e) => {
        const img = e.target.closest('.msg-image img');
        if (img && img.src) openLightbox(img.src);
    });

    /* ---------- một tin nhắn ---------- */
    function renderMessage(message, ctx) {
        const me = Number(ctx.me);
        const isMe = Number(message.MaNguoiGui) === me;
        const read = Number(message.DaDoc) === 1;
        const kind = kindOf(message);
        const text = String(message.NoiDung || '');
        const time = ctx.formatTime(message.NgayGui);
        let inner;
        if (kind === 'image') {
            const secure = text.startsWith('/api/');
            inner = `<div class="msg-image">
                <span class="msg-image-skeleton"><i class="bi bi-image"></i></span>
                <img alt="Hình ảnh" loading="lazy" ${secure ? `data-secure-src="${esc(text)}"` : `src="${esc(text)}"`}>
                <span class="msg-image-error"><i class="bi bi-exclamation-triangle"></i> Không tải được ảnh</span>
            </div>`;
        } else if (kind === 'offer') {
            inner = `<div class="msg-offer">
                <div class="msg-offer-label"><i class="bi bi-tag-fill"></i> ${isMe ? 'Bạn đề nghị giá' : 'Đề nghị giá'}</div>
                <div class="msg-offer-price">${money(message.GiaDeXuat)}</div>
                ${text && !/^\s*(trả giá|đề nghị)/i.test(text) ? `<div class="msg-offer-note">${linkify(text)}</div>` : ''}
            </div>`;
        } else {
            inner = `<div class="msg-text">${linkify(text)}</div>`;
        }
        const hint = !isMe && kind === 'text' ? scamHint(text) : '';
        const iso = message.NgayGui ? esc(new Date(ctx.parse(message.NgayGui) || 0).getTime()) : '';
        return `
        <div class="message-row ${isMe ? 'me' : 'them'}" data-message-id="${Number(message.MaTinNhan || 0)}" data-sender="${Number(message.MaNguoiGui)}" data-ts="${iso}" data-kind="${kind}">
            ${isMe ? '' : `<div class="msg-avatar" aria-hidden="true">${esc(initial(ctx.otherName))}</div>`}
            <div class="message-wrap">
                <div class="msg ${isMe ? 'me' : 'them'} msg-k-${kind}" title="${esc(time)}">${inner}</div>
                ${hint ? `<div class="msg-warning"><i class="bi bi-shield-exclamation"></i> ${esc(hint)}</div>` : ''}
                <div class="msg-meta">
                    <span class="msg-time">${esc(time)}</span>
                    ${isMe ? `<span class="msg-status ${read ? 'read' : ''}"><i class="bi ${read ? 'bi-check2-all' : 'bi-check2'}"></i> ${read ? 'Đã xem' : 'Đã gửi'}</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    /*
     * Nhóm tin liên tiếp của cùng một người (cách nhau < 5 phút, cùng ngày):
     * bo góc liền mạch, chỉ hiện avatar + giờ ở tin cuối nhóm, chỉ hiện trạng thái ở tin cuối cùng của mình.
     */
    function applyGrouping(container) {
        if (!container) return;
        const rows = [...container.querySelectorAll('.message-row')];
        let lastMine = null;
        rows.forEach((row, i) => {
            const prev = rows[i - 1];
            const next = rows[i + 1];
            const linked = (a, b) =>
                a &&
                b &&
                a.dataset.sender === b.dataset.sender &&
                Math.abs(Number(b.dataset.ts) - Number(a.dataset.ts)) < GROUP_GAP_MS &&
                // không nối qua dòng ngăn cách ngày
                a.nextElementSibling === b;
            const joinPrev = linked(prev, row);
            const joinNext = linked(row, next);
            row.classList.toggle('grp-top', !joinPrev);
            row.classList.toggle('grp-bottom', !joinNext);
            row.classList.remove('show-status');
            if (row.classList.contains('me')) lastMine = row;
        });
        lastMine?.classList.add('show-status');
        hydrateImages(container);
    }

    /* ---------- ngày ---------- */
    function renderDaySeparator(key, label) {
        return `<div class="message-day-separator" data-day-key="${esc(key)}"><span>${esc(label)}</span></div>`;
    }

    window.ChatRender = { renderMessage, applyGrouping, renderDaySeparator, preview, hydrateImages, kindOf, esc };
})();
