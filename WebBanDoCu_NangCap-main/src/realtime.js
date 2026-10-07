const clients = new Map();

/*
 * Trạng thái online chỉ gửi cho những người ĐÃ từng nhắn tin với nhau (và chưa chặn nhau),
 * không broadcast cho toàn bộ người đang online.
 */
const contactCache = new Map();
const CONTACT_TTL = 60 * 1000;

async function contactsOf(userId) {
    const id = Number(userId);
    const hit = contactCache.get(id);
    if (hit && hit.exp > Date.now()) return hit.ids;
    try {
        const ids = new Set(await require('./dal/messageDAL').getContactIds(id));
        contactCache.set(id, { ids, exp: Date.now() + CONTACT_TTL });
        return ids;
    } catch (error) {
        console.error('Không thể lấy danh sách liên hệ cho presence:', error);
        return new Set();
    }
}

function linkContacts(a, b) {
    for (const [self, other] of [
        [Number(a), Number(b)],
        [Number(b), Number(a)],
    ]) {
        const hit = contactCache.get(self);
        if (hit) hit.ids.add(other);
    }
}

function invalidateContacts(userId) {
    if (userId === undefined) contactCache.clear();
    else contactCache.delete(Number(userId));
}

async function broadcastPresence(userId) {
    const id = Number(userId);
    const payload = { userId: id, online: Boolean(clients.get(id)?.size) };
    for (const contactId of await contactsOf(id)) {
        if (clients.has(contactId)) send(contactId, 'presence', payload);
    }
}

function add(userId, res) {
    const id = Number(userId);

    if (!Number.isInteger(id) || id < 1) {
        return () => {};
    }

    if (!clients.has(id)) {
        clients.set(id, new Set());
    }

    const set = clients.get(id);
    set.add(res);
    if (set.size === 1) broadcastPresence(id);

    // Idempotent: cả res.on('close') lẫn controller đều có thể gọi, chỉ xử lý một lần
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        set.delete(res);

        if (!set.size) {
            if (clients.get(id) === set) clients.delete(id);
            broadcastPresence(id);
        }
    };

    res.on('close', cleanup);

    return cleanup;
}

function send(userId, event, data) {
    const set = clients.get(Number(userId));

    if (!set) return;

    const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;

    for (const res of [...set]) {
        try {
            res.write(payload);
        } catch (error) {
            if (!res.destroyed) console.error('Không thể gửi sự kiện realtime:', error);
            res.destroy();
            set.delete(res);
        }
    }

    if (!set.size) {
        clients.delete(Number(userId));
    }
}

function broadcastMessage(message) {
    if (!message) return;

    const payload = {
        MaTinNhan: message.MaTinNhan,
        MaNguoiGui: message.MaNguoiGui,
        MaNguoiNhan: message.MaNguoiNhan,
        MaSanPham: message.MaSanPham ?? null,
        NoiDung: message.NoiDung,
        DaDoc: message.DaDoc,
        NgayGui: message.NgayGui,
        TenNguoiGui: message.TenNguoiGui || '',
        TenNguoiNhan: message.TenNguoiNhan || '',
        TenSanPham: message.TenSanPham || '',
        GiaBan: message.GiaBan ?? null,
        HinhAnh: message.HinhAnh || '',
        LoaiTinNhan: message.LoaiTinNhan || 'text',
        GiaDeXuat: message.GiaDeXuat ?? null,
    };

    linkContacts(message.MaNguoiGui, message.MaNguoiNhan);
    send(message.MaNguoiGui, 'message', payload);
    send(message.MaNguoiNhan, 'message', payload);
}

function broadcastRead(userId, otherUserId, productId) {
    send(otherUserId, 'read', {
        userId: Number(userId),
        otherUserId: Number(otherUserId),
        productId: productId ? Number(productId) : null,
    });
}

module.exports = {
    add,
    send,
    isOnline: (userId) => Boolean(clients.get(Number(userId))?.size),
    broadcastMessage,
    broadcastRead,
    invalidateContacts,
};
