const dal = require('../dal/messageDAL');
class MessageBLL {
    async conversations(id) {
        return dal.getConversations(id);
    }
    async conversation(id, other, product) {
        if (!Number.isInteger(other) || other < 1) throw new Error('Người nhận không hợp lệ.');
        if (product !== null && product !== undefined && (!Number.isInteger(product) || product < 1))
            throw new Error('Sản phẩm không hợp lệ.');
        if (id === other) throw new Error('Không thể tự nhắn tin cho chính mình.');
        return dal.getConversation(id, other, product);
    }
    async send(id, other, product, content, options) {
        if (!Number.isInteger(other) || other < 1) throw new Error('Người nhận không hợp lệ.');
        if (product !== null && product !== undefined && (!Number.isInteger(product) || product < 1))
            throw new Error('Sản phẩm không hợp lệ.');
        if (id === other) throw new Error('Không thể tự nhắn tin cho chính mình.');
        return dal.send(id, other, product, content, options);
    }
    async read(id, other, product) {
        return dal.markRead(id, other, product);
    }
}
module.exports = new MessageBLL();
