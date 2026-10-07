const bll = require('../bll/messageBLL');
const realtime = require('../realtime');
const AppError = require('../errors/AppError');
const path = require('path');
const dal = require('../dal/messageDAL');

const CHAT_DIR = path.join(__dirname, '..', '..', 'private-uploads', 'chat');
exports.CHAT_DIR = CHAT_DIR;

exports.conversations = async (req, res, next) => {
    try {
        res.json(await bll.conversations(req.user.id));
    } catch (e) {
        next(AppError.from(e));
    }
};

exports.conversation = async (req, res, next) => {
    try {
        res.json(
            await bll.conversation(
                req.user.id,
                Number(req.query.userId),
                req.query.productId ? Number(req.query.productId) : null,
            ),
        );
    } catch (e) {
        next(AppError.from(e, 400));
    }
};

exports.send = async (req, res, next) => {
    try {
        const result = await bll.send(
            req.user.id,
            Number(req.body.userId),
            req.body.productId ? Number(req.body.productId) : null,
            req.file ? `/api/messages/files/${req.file.filename}` : req.body.noiDung,
            {
                type: req.file ? 'image' : req.body.type === 'offer' ? 'offer' : 'text',
                offer: req.body.giaDeXuat,
            },
        );

        // Gửi realtime cho cả người gửi và người nhận
        realtime.broadcastMessage(result);

        res.status(201).json(result);
    } catch (e) {
        next(AppError.from(e, 400));
    }
};

/* Chỉ trả trạng thái online của người đã từng trò chuyện với mình; người lạ / đã chặn luôn trả offline */
exports.presence = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        if (!Number.isInteger(userId) || userId < 1)
            return res.status(400).json({ message: 'Mã người dùng không hợp lệ.' });
        const allowed = userId === Number(req.user.id) || (await dal.hasOpenConversation(Number(req.user.id), userId));
        res.json({ userId, online: allowed ? realtime.isOnline(userId) : false });
    } catch (e) {
        next(AppError.from(e));
    }
};

/* Ảnh chat riêng tư: chỉ người gửi / người nhận mới xem được (tải bằng fetch kèm token) */
exports.chatFile = async (req, res, next) => {
    try {
        const name = String(req.params.name || '');
        if (!/^[\w-]+\.(jpg|png|webp)$/.test(name)) return res.status(404).json({ message: 'Không tìm thấy ảnh.' });
        const allowed = await dal.canViewChatImage(Number(req.user.id), `/api/messages/files/${name}`);
        if (!allowed) return res.status(404).json({ message: 'Không tìm thấy ảnh.' });
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(path.join(CHAT_DIR, name), (error) => {
            if (error && !res.headersSent) res.status(404).json({ message: 'Không tìm thấy ảnh.' });
        });
    } catch (e) {
        next(AppError.from(e));
    }
};

exports.read = async (req, res, next) => {
    try {
        const other = Number(req.body.userId);

        const product = req.body.productId ? Number(req.body.productId) : null;

        await bll.read(req.user.id, other, product);

        realtime.broadcastRead(req.user.id, other, product);

        res.json({
            message: 'Đã đánh dấu đã đọc.',
        });
    } catch (e) {
        next(AppError.from(e, 400));
    }
};

exports.stream = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');

    res.setHeader('Cache-Control', 'no-cache, no-transform');

    res.setHeader('Connection', 'keep-alive');

    res.setHeader('X-Accel-Buffering', 'no');

    res.flushHeaders?.();

    res.write(
        `event: connected\ndata: ${JSON.stringify({
            userId: req.user.id,
        })}\n\n`,
    );

    const cleanup = realtime.add(req.user.id, res);

    // Giữ kết nối không bị timeout
    const heartbeat = setInterval(() => {
        try {
            res.write(`event: ping\ndata: ${Date.now()}\n\n`);
        } catch (error) {
            clearInterval(heartbeat);
            cleanup();
            if (!res.destroyed) console.error('Không thể gửi heartbeat SSE:', error);
        }
    }, 25000);

    req.once('close', () => {
        clearInterval(heartbeat);
        cleanup();
    });
};
