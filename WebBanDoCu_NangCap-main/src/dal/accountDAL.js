const { poolPromise, sql } = require('./dbConfig');
class AccountDAL {
    async getProfile(id) {
        const p = await poolPromise;
        return (
            (
                await p
                    .request()
                    .input('id', sql.Int, Number(id))
                    .query(
                        `SELECT MaNguoiDung,HoTen,Email,SoDienThoai,VaiTro,TinhThanh,QuanHuyen,PhuongXa,DiaChiChiTiet,AnhDaiDien,NgayTao FROM NguoiDung WHERE MaNguoiDung=@id`,
                    )
            ).recordset[0] || null
        );
    }
    async getProfileByEmail(email) {
        const p = await poolPromise;
        return (
            (
                await p
                    .request()
                    .input(
                        'email',
                        sql.VarChar(255),
                        String(email || '')
                            .trim()
                            .toLowerCase(),
                    )
                    .query(
                        `SELECT MaNguoiDung,HoTen,Email,SoDienThoai,VaiTro,TinhThanh,QuanHuyen,PhuongXa,DiaChiChiTiet,AnhDaiDien,NgayTao FROM NguoiDung WHERE LOWER(Email)=@email`,
                    )
            ).recordset[0] || null
        );
    }
    async updateProfile(id, d) {
        const p = await poolPromise;
        const q = p
            .request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar(150), String(d.hoTen || '').trim())
            .input('phone', sql.VarChar(20), String(d.soDienThoai || '').trim())
            .input('province', sql.NVarChar(100), d.tinhThanh || null)
            .input('district', sql.NVarChar(100), d.quanHuyen || null)
            .input('ward', sql.NVarChar(100), d.phuongXa || null)
            .input('address', sql.NVarChar(255), d.diaChiChiTiet || null);
        if (!String(d.hoTen || '').trim()) throw Error('Họ tên không được để trống.');
        if (!/^0\d{9}$/.test(String(d.soDienThoai || '')))
            throw Error('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.');
        const dup = await p
            .request()
            .input('phone', sql.VarChar(20), String(d.soDienThoai).trim())
            .input('id', sql.Int, id)
            .query('SELECT 1 FROM NguoiDung WHERE SoDienThoai=@phone AND MaNguoiDung<>@id');
        if (dup.recordset.length) throw Error('Số điện thoại đã được tài khoản khác sử dụng.');
        return (
            await q.query(
                `UPDATE NguoiDung SET HoTen=@name,SoDienThoai=@phone,TinhThanh=@province,QuanHuyen=@district,PhuongXa=@ward,DiaChiChiTiet=@address,NgayCapNhat=SYSDATETIME() OUTPUT INSERTED.MaNguoiDung,INSERTED.HoTen,INSERTED.Email,INSERTED.SoDienThoai,INSERTED.VaiTro,INSERTED.TinhThanh,INSERTED.QuanHuyen,INSERTED.PhuongXa,INSERTED.DiaChiChiTiet,INSERTED.AnhDaiDien,INSERTED.NgayTao WHERE MaNguoiDung=@id`,
            )
        ).recordset[0];
    }
    async getListings(id) {
        const p = await poolPromise;
        return (
            await p
                .request()
                .input('id', sql.Int, id)
                .query(
                    `SELECT sp.*,dm.TenDanhMuc FROM SanPhamDoCu sp JOIN DanhMuc dm ON dm.MaDanhMuc=sp.MaDanhMuc WHERE sp.MaNguoiBan=@id AND sp.TrangThai<>N'Đã xóa' ORDER BY sp.NgayDang DESC`,
                )
        ).recordset;
    }
}
module.exports = new AccountDAL();
