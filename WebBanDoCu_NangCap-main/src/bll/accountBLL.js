const dal = require('../dal/accountDAL');
class B {
    async getAccount(id, email) {
        let profile = await dal.getProfile(id);
        if (!profile && email) profile = await dal.getProfileByEmail(email);
        if (!profile) throw Error('Không tìm thấy tài khoản.');
        return { profile };
    }
    async updateProfile(id, d) {
        return dal.updateProfile(id, d);
    }
    async getListings(id) {
        return dal.getListings(id);
    }
}
module.exports = new B();
