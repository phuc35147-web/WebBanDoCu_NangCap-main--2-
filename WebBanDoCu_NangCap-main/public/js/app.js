// --- 1. XỬ LÝ ĐÓNG/MỞ MODAL & FORM ĐĂNG NHẬP/ĐĂNG KÝ ---
function showAuthLogin(e) {
    if (e) e.preventDefault();
    document.getElementById('loginPanel').classList.remove('d-none');
    document.getElementById('registerPanel').classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).show();
}

function updateAuthUI() {
    const loginButton = document.getElementById('loginButton');
    const accountDropdown = document.getElementById('accountDropdown');

    const accountName = document.getElementById('accountName');
    const accountAvatar = document.getElementById('accountAvatar');

    const accountMenuName = document.getElementById('accountMenuName');
    const accountMenuEmail = document.getElementById('accountMenuEmail');
    const accountAvatarMenu = document.getElementById('accountAvatarMenu');

    const postButton = document.getElementById('btnPostForm');

    let user = null;

    try {
        user = JSON.parse(localStorage.getItem('user') || 'null');
    } catch (error) {
        console.error('Lỗi đọc thông tin tài khoản:', error);
        localStorage.removeItem('user');
    }

    const token = localStorage.getItem('token');

    // ==============================
    // CHƯA ĐĂNG NHẬP
    // ==============================
    if (!token || !user) {

        if (loginButton) {
            loginButton.style.display = 'inline-flex';
        }

        if (accountDropdown) {
            accountDropdown.style.display = 'none';
            accountDropdown.classList.remove('open');
        }

        if (postButton) {
            postButton.style.display = 'none';
        }

        return;
    }

    // ==============================
    // ĐÃ ĐĂNG NHẬP
    // ==============================

    // Ẩn nút Đăng nhập
    if (loginButton) {
        loginButton.style.display = 'none';
    }

    // Hiện khu vực Tài khoản
    if (accountDropdown) {
        accountDropdown.style.display = 'block';
    }

    // Lấy tên người dùng
    const name = user.hoTen || user.HoTen || user.name || 'Tài khoản';

    // Lấy email
    const email = user.email || user.Email || '';

    // Chữ cái đầu làm avatar
    const firstLetter = name
        .trim()
        .charAt(0)
        .toUpperCase() || 'P';

    // Tên trên Header
    if (accountName) {
        accountName.textContent = name;
    }

    // Avatar trên Header
    if (accountAvatar) {
        accountAvatar.textContent = firstLetter;
    }

    // Tên trong menu
    if (accountMenuName) {
        accountMenuName.textContent = name;
    }

    // Email trong menu
    if (accountMenuEmail) {
        accountMenuEmail.textContent = email;
    }

    // Avatar trong menu
    if (accountAvatarMenu) {
        accountAvatarMenu.textContent = firstLetter;
    }

    // Hiển thị nút Đăng tin cho mọi tài khoản đã đăng nhập
    if (postButton) {
        const role = String(
            user.vaiTro ||
            user.VaiTro ||
            user.role ||
            ''
        ).toLowerCase();

        // Tài khoản đã đăng nhập đều nhìn thấy nút Đăng Tin.
        // openPostModal() chỉ yêu cầu tài khoản đã đăng nhập.
        postButton.style.display = 'inline-block';
    }
}

function logout() {
    // Xóa toàn bộ phiên đăng nhập ở trình duyệt.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');

    const accountDropdown = document.getElementById('accountDropdown');
    if (accountDropdown) {
        accountDropdown.classList.remove('open', 'drop-up');
    }

    // Dùng replace để không quay lại được trang đã đăng nhập bằng nút Back.
    window.location.replace('/');
}

// Giữ tương thích nếu một trang cũ còn gọi handleLogout().
window.handleLogout = logout;

// ============================================
// XỬ LÝ MENU TÀI KHOẢN
// ============================================
function initAccountDropdown() {
    const accountButton = document.getElementById('accountButton');
    const accountDropdown = document.getElementById('accountDropdown');
    const accountMenu = document.getElementById('accountMenu');

    if (!accountButton || !accountDropdown || !accountMenu) return;

    function closeMenu() {
        accountDropdown.classList.remove('open', 'drop-up');
        accountMenu.classList.remove('account-menu-visible');
        accountMenu.style.removeProperty('top');
        accountMenu.style.removeProperty('left');
    }

    function positionMenu() {
        // Hiện menu trước để lấy kích thước thật.
        accountMenu.classList.add('account-menu-visible');
        const buttonRect = accountButton.getBoundingClientRect();
        const menuRect = accountMenu.getBoundingClientRect();
        const gap = 8;
        const margin = 12;

        let left = buttonRect.right - menuRect.width;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin));

        let top = buttonRect.bottom + gap;
        accountDropdown.classList.remove('drop-up');

        // Không đủ chỗ phía dưới thì mở lên trên.
        if (top + menuRect.height > window.innerHeight - margin && buttonRect.top - gap - menuRect.height >= margin) {
            top = buttonRect.top - gap - menuRect.height;
            accountDropdown.classList.add('drop-up');
        }

        accountMenu.style.top = `${Math.round(top)}px`;
        accountMenu.style.left = `${Math.round(left)}px`;
    }

    accountButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const opening = !accountDropdown.classList.contains('open');
        if (!opening) {
            closeMenu();
            return;
        }

        accountDropdown.classList.add('open');
        requestAnimationFrame(positionMenu);
    });

    accountMenu.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    document.addEventListener('click', function (e) {
        if (!accountDropdown.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', function () {
        if (accountDropdown.classList.contains('open')) positionMenu();
    });
}

function showAuthRegister(e) {
    if (e) e.preventDefault();
    document.getElementById('loginPanel').classList.add('d-none');
    document.getElementById('registerPanel').classList.remove('d-none');
    showRegistrationPhoneStep();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).show();
}

function showRegistrationPhoneStep(e) {
    if (e) e.preventDefault();
    document.getElementById('registerPhoneForm').classList.remove('d-none');
    document.getElementById('registerForm').classList.add('d-none');
}

async function handleRegistrationPhone(e) {
    e.preventDefault();
    try {
        const phone = document.getElementById('registerPhone').value.trim();
        const response = await fetch('/api/auth/check-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ soDienThoai: phone })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể kiểm tra số điện thoại.');
        if (data.exists) return alert('Số điện thoại này đã được đăng ký.');
        document.getElementById('registrationPhoneVerified').value = phone;
        document.getElementById('registerPhoneForm').classList.add('d-none');
        document.getElementById('registerForm').classList.remove('d-none');
    } catch (error) {
        alert(error.message);
    }
}

// --- 2. XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ ---
async function handleLogin(e) {
    e.preventDefault();
    const button = e.submitter;
    if (button) button.disabled = true;
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: document.getElementById('loginIdentifier').value.trim(),
                matKhau: document.getElementById('loginPass').value
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Đăng nhập thất bại.');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).hide();
        location.reload();
    } catch (error) {
        alert(error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const button = e.submitter;
    if (button) button.disabled = true;
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hoTen: document.getElementById('registerName').value.trim(),
                email: document.getElementById('registerEmail').value.trim(),
                soDienThoai: document.getElementById('registrationPhoneVerified').value.trim(),
                matKhau: document.getElementById('registerPass').value,
                dongYDieuKhoan: document.getElementById('registerConsent').checked,
                tinhThanh: document.querySelector('#registerProvince option:checked')?.textContent,
                quanHuyen: null,
                phuongXa: document.querySelector('#registerWard option:checked')?.textContent,
                diaChiChiTiet: document.getElementById('registerAddress').value.trim()
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Đăng ký thất bại.');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        alert('Đăng ký thành công.');
        location.reload();
    } catch (error) {
        alert(error.message);
    } finally {
        if (button) button.disabled = false;
    }
}

let editingProductId = null;

async function openPostModal() {
    const token = localStorage.getItem('token');
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch (_) {}

    if (!token || !user) {
        window.location.href = '/auth.html?mode=login';
        return;
    }

    await loadPostCategories();

    const editing = JSON.parse(localStorage.getItem('editingProduct') || 'null');
    if (editing) {
        editingProductId = editing.MaSanPham || editing.maSanPham || editing.id;
        preparePostForm(editing);
        localStorage.removeItem('editingProduct');
        showPostFormModal();
        return;
    }

    // Đăng tin mới: mở màn chọn danh mục trước, giống luồng đăng tin của các sàn rao vặt.
    const chooser = document.getElementById('postCategoryModal');
    if (chooser) {
        bootstrap.Modal.getOrCreateInstance(chooser).show();
    } else {
        showPostFormModal();
    }
}

function showPostFormModal() {
    const modal = document.getElementById('postModal');
    if (modal) bootstrap.Modal.getOrCreateInstance(modal).show();
}

function preparePostForm(editing) {
    const title = document.getElementById('postModalLabel');
    const submit = document.getElementById('postSubmitButton');
    if (title) title.innerHTML = '<i class="bi bi-pencil-square me-2"></i>Chỉnh sửa tin đăng';
    if (submit) submit.innerHTML = '<i class="bi bi-save me-2"></i>Lưu thay đổi';

    const productName = document.getElementById('postProductName');
    const category = document.getElementById('postCategory');
    const condition = document.getElementById('postCondition');
    const price = document.getElementById('postPrice');
    const quantity = document.getElementById('postQuantity');
    const description = document.getElementById('postDescription');
    const address = document.getElementById('postAddress');
    const confirmBox = document.getElementById('postConfirm');
    const imageInput = document.getElementById('postImage');
    const province = document.getElementById('postProvince');
    const ward = document.getElementById('postWard');

    if (productName) productName.value = editing.TenSanPham || '';
    if (category) category.value = editing.MaDanhMuc || '';
    if (condition) condition.value = editing.TinhTrang || '';
    if (price) price.value = editing.GiaBan || '';
    if (quantity) quantity.value = Number(editing.SoLuong || 1);
    if (description) description.value = editing.MoTa || '';
    if (address) address.value = editing.DiaChiXemHang || '';
    if (confirmBox) confirmBox.checked = true;
    if (imageInput) imageInput.required = false;
    if (province) {
        province.required = false;
        province.disabled = true;
    }
    if (ward) {
        ward.required = false;
        ward.disabled = true;
    }
}

function startPostWithCategory(categoryId) {
    const select = document.getElementById('postCategory');
    if (!select) return;
    select.value = String(categoryId);

    editingProductId = null;
    const title = document.getElementById('postModalLabel');
    const submit = document.getElementById('postSubmitButton');
    if (title) title.innerHTML = '<i class="bi bi-megaphone me-2"></i>Đăng tin bán đồ cũ';
    if (submit) submit.innerHTML = '<i class="bi bi-send me-2"></i>Đăng tin ngay';
    const image = document.getElementById('postImage');
    const province = document.getElementById('postProvince');
    const ward = document.getElementById('postWard');
    if (image) image.required = true;
    if (province) province.required = true;
    if (ward) ward.required = true;

    const chooser = document.getElementById('postCategoryModal');
    if (chooser) {
        const instance = bootstrap.Modal.getInstance(chooser);
        if (instance) instance.hide();
    }
    setTimeout(showPostFormModal, 180);
}

async function loadPostCategories() {
    const select = document.getElementById('postCategory');
    if (!select) return;

    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        if (!response.ok) throw new Error(categories.message || 'Không tải được danh mục.');

        select.innerHTML = '<option value="">-- Chọn danh mục --</option>' +
            categories.map(c => `<option value="${c.MaDanhMuc}">${escapeHtml(c.TenDanhMuc)}</option>`).join('');
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Không tải được danh mục</option>';
    }
}

function showPostMessage(message, type = 'danger') {
    const box = document.getElementById('postFormMessage');
    if (!box) return;
    box.className = `alert alert-${type} mt-3 mb-0`;
    box.textContent = message;
    box.classList.remove('d-none');
}

function hidePostMessage() {
    const box = document.getElementById('postFormMessage');
    if (box) box.classList.add('d-none');
}

function previewPostImage() {
    const input = document.getElementById('postImage');
    const preview = document.getElementById('postImagePreview');
    const image = document.getElementById('postImagePreviewImg');
    if (!input || !preview || !image) return;

    const files = Array.from(input.files || []);
    const file = files[0];
    if (!file) {
        preview.classList.add('d-none');
        image.src = '';
        return;
    }

    if (files.length > 8 || files.some(f => f.size > 5 * 1024 * 1024)) {
        input.value = '';
        preview.classList.add('d-none');
        showPostMessage('Tối đa 8 ảnh, mỗi ảnh không quá 5MB.');
        return;
    }

    image.src = URL.createObjectURL(file);
    preview.classList.remove('d-none');
}

async function handlePostProduct(e) {
    e.preventDefault();
    hidePostMessage();

    const form = document.getElementById('postProductForm');
    const submit = document.getElementById('postSubmitButton');
    if (!form) return;

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        showPostMessage('Vui lòng điền đầy đủ tất cả thông tin bắt buộc (*).');
        return;
    }

    const province = document.getElementById('postProvince');
    const ward = document.getElementById('postWard');
    const address = document.getElementById('postAddress');
    const imageInput = document.getElementById('postImage');

    if ((!editingProductId && (!province?.value || !ward?.value)) || !address?.value.trim()) {
        showPostMessage('Vui lòng điền đầy đủ tỉnh/thành phố, phường/xã và địa chỉ chi tiết.');
        return;
    }

    if (!editingProductId && !imageInput?.files?.length) {
        showPostMessage('Bạn phải chọn ít nhất 1 ảnh minh họa cho sản phẩm.');
        return;
    }

    const files = Array.from(imageInput?.files || []);
    if (files.length > 8 || files.some(file => file.size > 5 * 1024 * 1024)) {
        showPostMessage('Tối đa 8 ảnh, mỗi ảnh không quá 5MB.');
        return;
    }

    const formData = new FormData(form);
    const fullAddress = editingProductId ? address.value.trim() : `${province.options[province.selectedIndex].text}, ${ward.options[ward.selectedIndex].text}, ${address.value.trim()}`;
    formData.set('diaChiXemHang', fullAddress);
    formData.set('soLuong', document.getElementById('postQuantity')?.value || '1');

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang đăng tin...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(editingProductId ? `/api/products/${editingProductId}` : '/api/products', {
            method: editingProductId ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Đăng tin thất bại.');

        const isEditing = Boolean(editingProductId);
        const successMessage = isEditing
            ? 'Cập nhật tin thành công! Tin của bạn đã được chuyển sang trạng thái CHỜ DUYỆT. Vui lòng chờ Admin kiểm duyệt.'
            : 'Đăng tin thành công! Tin của bạn đã được chuyển sang trạng thái CHỜ DUYỆT. Vui lòng chờ Admin kiểm duyệt.';

        // Thông báo bằng hộp thoại để người dùng bấm OK rồi thoát khỏi form đăng tin.
        // Không tự đóng sau một khoảng thời gian vì người dùng cần đọc thông báo.
        alert(successMessage);

        form.reset();
        form.classList.remove('was-validated');
        if (document.getElementById('postWard')) document.getElementById('postWard').disabled = true;
        if (document.getElementById('postImagePreview')) document.getElementById('postImagePreview').classList.add('d-none');
        hidePostMessage();

        const modal = bootstrap.Modal.getInstance(document.getElementById('postModal'));
        if (modal) modal.hide();
        editingProductId = null;
        fetchProducts();
    } catch (error) {
        console.error(error);
        showPostMessage(error.message || 'Không thể đăng tin.');
    } finally {
        submit.disabled = false;
        submit.innerHTML = '<i class="bi bi-send me-2"></i>Đăng tin ngay';
    }
}


// --- 3. TÌM KIẾM ---
function searchTag(tag) {
    document.getElementById('searchKeyword').value = tag;
    fetchProducts();
}
// --- 4. GỌI API TỈNH/THÀNH PHỐ VIỆT NAM (Tự động) ---
async function loadProvinces(selectId) {
    try {
        const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
        const data = await res.json();
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">Chọn Tỉnh/Thành phố</option>';
        data.forEach(p => {
            select.innerHTML += `<option value="${p.code}">${p.name}</option>`;
        });
    } catch (err) {
        console.error("Lỗi tải tỉnh thành:", err);
    }
}

async function loadSearchLocations() {
    const select = document.getElementById('searchLocation');
    if (!select) return;

    try {
        const response = await fetch('https://provinces.open-api.vn/api/v2/p/');
        if (!response.ok) throw new Error('Không tải được danh sách tỉnh/thành phố.');

        const provinces = await response.json();
        if (!Array.isArray(provinces)) throw new Error('Dữ liệu tỉnh/thành phố không hợp lệ.');

        const getPriority = province => {
            const name = province.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (name.includes('ho chi minh')) return 0;
            if (name.includes('ha noi')) return 1;
            return 2;
        };

        const sortedProvinces = [...provinces].sort((a, b) =>
            getPriority(a) - getPriority(b) ||
            a.name.localeCompare(b.name, 'vi')
        );

        select.replaceChildren(new Option('📍 Chọn khu vực', ''));
        sortedProvinces.forEach(province => {
            const priority = getPriority(province);
            const locationValue = priority === 0
                ? 'Hồ Chí Minh'
                : priority === 1
                    ? 'Hà Nội'
                    : province.name;
            const option = new Option(province.name, locationValue);
            option.className = 'text-dark';
            select.add(option);
        });
    } catch (error) {
        console.error('Lỗi tải khu vực tìm kiếm:', error);
        select.replaceChildren(
            new Option('📍 Chọn khu vực', ''),
            new Option('Không tải được danh sách khu vực', '', true, true)
        );
        select.options[1].disabled = true;
    }
}

async function loadWards(provinceCode, wardSelectId) {
    if (!provinceCode) return;
    try {
        const res = await fetch(`https://provinces.open-api.vn/api/v2/p/${provinceCode}?depth=2`);
        const data = await res.json();
        const select = document.getElementById(wardSelectId);
        if (!select) return;

        // API v2 sau sáp nhập 07/2025 trả danh sách phường/xã trực tiếp ở data.wards.
        let wards = Array.isArray(data.wards) ? data.wards : [];

        // Fallback cho cấu trúc API cũ nếu còn dữ liệu districts/wards.
        if (!wards.length && Array.isArray(data.districts)) {
            data.districts.forEach(d => (d.wards || []).forEach(w => {
                wards.push({ ...w, district_name: d.name });
            }));
        }

        select.innerHTML = '<option value="">Chọn Phường/Xã</option>';
        wards.sort((a, b) => a.name.localeCompare(b.name, 'vi')).forEach(w => {
            select.innerHTML += `<option value="${w.code}">${w.name}</option>`;
        });
        select.disabled = wards.length === 0;
    } catch (err) {
        console.error("Lỗi tải quận huyện:", err);
    }
}

// --- 5. HIỂN THỊ TIN ĐĂNG ---
let productPage = 0;
let productTotal = 0;
let productRequestId = 0;
let nearbyPosition = null;
function getNearbyPosition() {
    if (nearbyPosition) return Promise.resolve(nearbyPosition);
    if (!navigator.geolocation) return Promise.reject(new Error('Trình duyệt không hỗ trợ xác định vị trí.'));
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            position => {
                nearbyPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                resolve(nearbyPosition);
            },
            () => reject(new Error('Cần cho phép truy cập vị trí để tìm tin gần bạn.')),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    });
}
async function fetchProducts(options = {}) {
    const dealList = document.getElementById('productList');
    const allList = document.getElementById('allProductList');
    if (!dealList && !allList) return;
    const loadMoreButton = document.getElementById('loadMoreProductsBtn');
    const loadError = document.getElementById('productLoadError');
    const append = options.append === true;
    const requestId = ++productRequestId;
    const page = append ? productPage + 1 : 1;
    if (loadMoreButton) loadMoreButton.disabled = true;
    if (loadError) loadError.classList.add('d-none');
    try {
        const keyword = document.getElementById('searchKeyword')?.value.trim() || '';
        const location = document.getElementById('searchLocation')?.value || '';
        const sort = document.getElementById('searchSort')?.value || 'newest';
        const position = sort === 'near' ? await getNearbyPosition() : null;
        const filters = {
            keyword,
            location,
            minPrice: document.getElementById('searchMinPrice')?.value || '',
            maxPrice: document.getElementById('searchMaxPrice')?.value || '',
            tinhTrang: document.getElementById('searchCondition')?.value || '',
            sort,
            page,
            limit: 12
        };
        if (position) {
            filters.latitude = position.latitude;
            filters.longitude = position.longitude;
        }
        if (!append) {
            productPage = 0;
            productTotal = 0;
            if (allList) allList.innerHTML = '<div class="col-12 text-center text-muted py-5">Đang tải sản phẩm...</div>';
            if (loadMoreButton) loadMoreButton.classList.add('d-none');
        }
        const response = await fetch(`/api/products?${new URLSearchParams(filters)}`);
        if (!response.ok) throw new Error('Không thể tải danh sách sản phẩm.');
        const products = await response.json();
        if (requestId !== productRequestId) return;
        if (page === 1) productTotal = Number(response.headers.get('X-Total-Count') || 0);
        const renderProducts = items => items.length ? items.map(product => `
            <div class="col-6 col-md-3 mb-4">
                <a href="/product-detail.html?id=${encodeURIComponent(product.MaSanPham)}" class="text-decoration-none text-dark">
                    <div class="card product-card h-100 shadow-sm">
                        <img src="${escapeHtml(thumbUrl(product.HinhAnh))}" loading="lazy" class="card-img-top product-img" alt="${escapeHtml(product.TenSanPham)}">
                        <div class="card-body">
                            <span class="badge badge-condition mb-2">${escapeHtml(product.TenDanhMuc)}</span>
                            <h6 class="card-title text-truncate fw-bold">${escapeHtml(product.TenSanPham)}</h6>
                            <p class="price-tag mb-1 text-danger fw-bold">${Number(product.GiaBan).toLocaleString('vi-VN')} đ</p>
                            <small class="text-muted"><i class="bi bi-person me-1"></i>${escapeHtml(product.TenNguoiBan || 'Người bán')}</small>
                            ${Number.isFinite(Number(product.DistanceKm)) ? `<div class="small text-primary mt-1"><i class="bi bi-geo-alt me-1"></i>${Number(product.DistanceKm).toFixed(1)} km</div>` : ''}
                        </div>
                    </div>
                </a>
            </div>`).join('') : '<div class="col-12 text-center text-muted py-5">Chưa có sản phẩm nào phù hợp.</div>';
        if (dealList) dealList.innerHTML = '';
        if (allList) {
            if (append) {
                allList.insertAdjacentHTML('beforeend', renderProducts(products));
            } else {
                allList.innerHTML = renderProducts(products);
            }
        }
        productPage = page;
        if (loadMoreButton) {
            loadMoreButton.classList.toggle('d-none', productPage * 12 >= productTotal);
        }
    } catch (error) {
        if (requestId !== productRequestId) return;
        console.error(error);
        if (dealList) dealList.innerHTML = '<div class="col-12 text-center text-danger py-5">Không thể tải danh sách sản phẩm.</div>';
        if (allList && !append) allList.innerHTML = '<div class="col-12 text-center text-danger py-5">Không thể tải danh sách sản phẩm.</div>';
        if (append && loadError) {
            loadError.textContent = error.message || 'Không thể tải thêm sản phẩm.';
            loadError.classList.remove('d-none');
        }
    } finally {
        if (requestId === productRequestId && loadMoreButton) loadMoreButton.disabled = false;
    }
}
async function saveCurrentSearch() {
    const token = localStorage.getItem('token');
    if (!token) {
        location.href = '/auth.html?mode=login';
        return;
    }
    const filters = {
        keyword: document.getElementById('searchKeyword')?.value.trim() || '',
        location: document.getElementById('searchLocation')?.value || '',
        minPrice: document.getElementById('searchMinPrice')?.value || '',
        maxPrice: document.getElementById('searchMaxPrice')?.value || '',
        tinhTrang: document.getElementById('searchCondition')?.value || '',
        sort: document.getElementById('searchSort')?.value || 'newest'
    };
    const name = prompt('Tên cho tìm kiếm đã lưu:', filters.keyword || 'Tìm kiếm của tôi');
    if (name === null) return;
    try {
        const response = await fetch('/api/search/saved', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, filters })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể lưu tìm kiếm.');
        const hint = document.getElementById('searchHint');
        if (hint) {
            hint.textContent = data.message;
            setTimeout(() => { hint.textContent = ''; }, 3000);
        }
        await loadSavedSearches();
    } catch (error) {
        alert(error.message);
    }
}
async function loadSavedSearches() {
    const token = localStorage.getItem('token');
    const container = document.getElementById('savedSearchList');
    if (!token || !container) return;
    const response = await fetch('/api/search/saved', { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Không thể tải tìm kiếm đã lưu.');
    const searches = await response.json();
    container.replaceChildren();
    if (!searches.length) return;
    const label = document.createElement('span');
    label.textContent = 'Đã lưu: ';
    container.append(label);
    searches.forEach(search => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-light me-1 mb-1';
        button.textContent = search.Ten;
        button.addEventListener('click', () => {
            const filters = search.BoLoc || {};
            const fields = {
                keyword: 'searchKeyword',
                location: 'searchLocation',
                minPrice: 'searchMinPrice',
                maxPrice: 'searchMaxPrice',
                tinhTrang: 'searchCondition',
                sort: 'searchSort'
            };
            Object.entries(fields).forEach(([key, id]) => {
                const element = document.getElementById(id);
                if (element && filters[key] !== undefined) element.value = filters[key];
            });
            fetchProducts();
        });
        container.append(button);
    });
}
async function loadRecentlyViewed() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const response = await fetch('/api/products/recently-viewed', {
        headers: { Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new Error('Không thể tải tin đã xem gần đây.');
    const products = await response.json();
    const section = document.getElementById('recentlyViewedSection');
    const list = document.getElementById('recentlyViewedList');
    if (!section || !list || !products.length) return;
    section.classList.remove('d-none');
    list.innerHTML = products.slice(0, 4).map(product => `
        <div class="col-6 col-md-3">
            <a href="/product-detail.html?id=${encodeURIComponent(product.MaSanPham)}" class="text-decoration-none text-dark">
                <div class="card product-card h-100 shadow-sm">
                    <img src="${escapeHtml(thumbUrl(product.HinhAnh))}" loading="lazy" class="card-img-top product-img" alt="${escapeHtml(product.TenSanPham)}" loading="lazy">
                    <div class="card-body"><h6 class="card-title text-truncate fw-bold">${escapeHtml(product.TenSanPham)}</h6>
                    <p class="mb-0 text-danger fw-bold">${Number(product.GiaBan).toLocaleString('vi-VN')} đ</p></div>
                </div>
            </a>
        </div>`).join('');
}
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleSeoBtn');
    const wrapper = document.getElementById('seoContentWrapper');
    const icon = document.getElementById('toggleSeoIcon');

    if (toggleBtn && wrapper) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = wrapper.classList.contains('collapsed');

            if (isCollapsed) {
                // Mở rộng văn bản
                wrapper.classList.remove('collapsed');
                wrapper.classList.add('expanded');
                toggleBtn.querySelector('span').textContent = 'Thu gọn';
                if (icon) {
                    icon.classList.remove('bi-chevron-down');
                    icon.classList.add('bi-chevron-up');
                }
            } else {
                // Thu gọn văn bản lại
                wrapper.classList.remove('expanded');
                wrapper.classList.add('collapsed');
                toggleBtn.querySelector('span').textContent = 'Xem thêm';
                if (icon) {
                    icon.classList.remove('bi-chevron-up');
                    icon.classList.add('bi-chevron-down');
                }

                // Cuộn mượt về đầu phần giới thiệu để người dùng không bị mất vị trí
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
});
/* Ảnh thu nhỏ 480px cho danh sách (server tạo khi có `sharp`, nếu không sẽ trả ảnh gốc) */
function thumbUrl(path) {
    const match = /^\/uploads\/([\w.-]+\.(?:jpg|png|webp))$/i.exec(String(path || ''));
    return match && match[1] !== 'default.jpg' ? `/uploads/t/${match[1]}` : path || '/uploads/default.jpg';
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
}

// Khởi chạy mọi thứ khi trang đã tải xong
document.addEventListener("DOMContentLoaded", () => {

    // Cho phép nhấn Enter trong ô tìm kiếm để tìm sản phẩm.
    const searchInput = document.getElementById('searchKeyword');
    if (searchInput) {
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                fetchProducts();
            }
        });
        let suggestionTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(suggestionTimer);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                document.getElementById('searchSuggestions').replaceChildren();
                return;
            }
            suggestionTimer = setTimeout(async () => {
                try {
                    const response = await fetch('/api/search/suggestions?q=' + encodeURIComponent(query));
                    if (!response.ok) throw new Error('Không thể tải gợi ý tìm kiếm.');
                    const data = await response.json();
                    const datalist = document.getElementById('searchSuggestions');
                    datalist.replaceChildren(...(data.suggestions || []).map(value => new Option(value, value)));
                } catch (error) {
                    console.error('SEARCH SUGGESTIONS:', error);
                }
            }, 250);
        });
    }

    const searchLocation = document.getElementById('searchLocation');
    if (searchLocation) {
        loadSearchLocations();
        searchLocation.addEventListener('change', fetchProducts);
    }
    ['searchMinPrice', 'searchMaxPrice', 'searchCondition', 'searchSort'].forEach(id => {
        const control = document.getElementById(id);
        if (control) control.addEventListener('change', fetchProducts);
    });

    fetchProducts();
    loadRecentlyViewed().catch(error => console.error('RECENTLY VIEWED:', error));
    loadSavedSearches().catch(error => console.error('SAVED SEARCHES:', error));

    const params = new URLSearchParams(window.location.search);
    if (params.get('post') === '1' || params.get('editProduct') === '1') {
        setTimeout(() => openPostModal(), 250);
    }

    // Kiểm tra trạng thái đăng nhập
    updateAuthUI();

    // Khởi tạo menu Tài khoản
    initAccountDropdown();

    // Nạp API Tỉnh Thành
    loadProvinces('registerProvince');

    const registerProvince = document.getElementById('registerProvince');

    if (registerProvince) {

        registerProvince.addEventListener('change', function () {

            loadWards(
                this.value,
                'registerWard'
            );

        });

    }

    const postProvince = document.getElementById('postProvince');
    if (postProvince) {
        loadProvinces('postProvince');
        postProvince.addEventListener('change', function () {
            loadWards(this.value, 'postWard');
        });
    }

    const postCategoryItems = document.querySelectorAll('.post-category-item');
    postCategoryItems.forEach(item => {
        item.addEventListener('click', () => startPostWithCategory(item.dataset.categoryId));
    });

    const postImage = document.getElementById('postImage');
    if (postImage) postImage.addEventListener('change', previewPostImage);

    const postModal = document.getElementById('postModal');
    if (postModal) {
        postModal.addEventListener('hidden.bs.modal', () => {
            hidePostMessage();
            const form = document.getElementById('postProductForm');
            if (form) {
                form.reset();
                form.classList.remove('was-validated');
            }
            const ward = document.getElementById('postWard');
            if (ward) {
                ward.disabled = true;
                ward.innerHTML = '<option value="">Chọn tỉnh/thành trước</option>';
            }
            editingProductId = null;
            const title = document.getElementById('postModalLabel');
            if(title) title.innerHTML='<i class=\"bi bi-megaphone me-2\"></i>Đăng tin bán đồ cũ';
            const submit = document.getElementById('postSubmitButton');
            if(submit) submit.innerHTML='<i class=\"bi bi-send me-2\"></i>Đăng tin ngay';
            const imageInput = document.getElementById('postImage');
            if(imageInput) imageInput.required=true;
            if(document.getElementById('postProvince')) document.getElementById('postProvince').required=true;
            if(document.getElementById('postWard')) document.getElementById('postWard').required=true;
            const preview = document.getElementById('postImagePreview');
            if (preview) preview.classList.add('d-none');
        });
    }
    

});
function openMessages() {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = '/auth.html?mode=login';
        return;
    }

    window.location.href = '/messages.html';
}
    
