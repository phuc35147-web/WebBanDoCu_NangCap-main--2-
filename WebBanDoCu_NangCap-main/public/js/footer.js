/* Chân trang dùng chung + áp thông tin liên hệ từ site-config.js */
(function () {
    const cfg = window.SITE_CONFIG || {};
    const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const phone = String(cfg.hotline || '').replace(/[^\d+]/g, '');

    function applyContacts() {
        const urls = { hotline: phone ? `tel:${phone}` : '', zalo: cfg.zalo, facebook: cfg.facebook };
        document.querySelectorAll('[data-site]').forEach((el) => {
            const key = el.dataset.site;
            const url = urls[key];
            if (url && /^(https?:|tel:)/.test(url)) {
                el.setAttribute('href', url);
                el.hidden = false;
            } else el.hidden = true;
        });
        document.querySelectorAll('[data-site-text]').forEach((el) => {
            el.textContent = cfg[el.dataset.siteText] || '';
        });
    }

    function renderFooter() {
        if (document.body.hasAttribute('data-no-footer') || document.getElementById('siteFooter')) return;
        const contact = [
            cfg.hotline ? `<li><i class="bi bi-telephone me-2"></i><a href="tel:${esc(phone)}">${esc(cfg.hotline)}</a></li>` : '',
            cfg.email ? `<li><i class="bi bi-envelope me-2"></i><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></li>` : '',
            cfg.address ? `<li><i class="bi bi-geo-alt me-2"></i>${esc(cfg.address)}</li>` : '',
        ].join('');
        const footer = document.createElement('footer');
        footer.id = 'siteFooter';
        footer.className = 'site-footer';
        footer.innerHTML = `
            <div class="site-footer__inner">
                <div>
                    <strong class="site-footer__brand">${esc(cfg.name || 'Chợ Đồ Cũ')}</strong>
                    <p>Nền tảng kết nối người mua và người bán đồ cũ. Chúng tôi là kênh trung gian đăng tin, không phải bên bán hàng và không tham gia vào giao dịch giữa các thành viên.</p>
                </div>
                <div>
                    <h6>Thông tin</h6>
                    <ul>
                        <li><a href="/terms.html">Điều khoản sử dụng</a></li>
                        <li><a href="/privacy.html">Chính sách bảo mật</a></li>
                        <li><a href="/regulations.html">Quy chế hoạt động</a></li>
                        <li><a href="/contact.html">Liên hệ &amp; báo cáo vi phạm</a></li>
                    </ul>
                </div>
                <div>
                    <h6>Liên hệ</h6>
                    <ul>${contact || '<li><a href="/contact.html">Gửi yêu cầu hỗ trợ</a></li>'}</ul>
                </div>
            </div>
            <div class="site-footer__bottom">
                © ${new Date().getFullYear()} ${esc(cfg.owner || cfg.name || 'Chợ Đồ Cũ')}${cfg.businessLicense ? ' · ' + esc(cfg.businessLicense) : ''}
                ${cfg.ecommerceNotice ? '<br>' + esc(cfg.ecommerceNotice) : ''}
            </div>`;
        document.body.appendChild(footer);
    }

    function init() {
        renderFooter();
        applyContacts();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
