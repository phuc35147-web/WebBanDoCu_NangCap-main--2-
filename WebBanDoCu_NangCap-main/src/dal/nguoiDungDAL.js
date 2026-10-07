const { poolPromise, sql } = require('./dbConfig');
class NguoiDungDAL {
    async findById(id) {
        const p = await poolPromise;
        return (
            (
                await p
                    .request()
                    .input('id', sql.Int, Number(id))
                    .query('SELECT TOP 1 * FROM NguoiDung WHERE MaNguoiDung=@id')
            ).recordset[0] || null
        );
    }
    async findByEmail(email) {
        const p = await poolPromise;
        const r = await p
            .request()
            .input('email', sql.VarChar(255), String(email).trim().toLowerCase())
            .query('SELECT * FROM NguoiDung WHERE Email=@email');
        return r.recordset[0];
    }
    async findByPhone(phone) {
        const p = await poolPromise;
        const r = await p
            .request()
            .input('phone', sql.VarChar(20), phone)
            .query('SELECT * FROM NguoiDung WHERE SoDienThoai=@phone');
        return r.recordset[0];
    }
    async create(d) {
        const p = await poolPromise;
        const tx = new sql.Transaction(p);
        await tx.begin();
        try {
            const r = await tx
                .request()
                .input('otpId', sql.Int, d.otpId)
                .input('email', sql.VarChar(255), d.email.toLowerCase())
                .input('name', sql.NVarChar(150), d.hoTen)
                .input('phone', sql.VarChar(20), d.soDienThoai)
                .input('pass', sql.VarChar(255), d.matKhau)
                .input('tt', sql.NVarChar(100), d.tinhThanh)
                .input('qh', sql.NVarChar(100), d.quanHuyen)
                .input('px', sql.NVarChar(100), d.phuongXa)
                .input('dc', sql.NVarChar(255), d.diaChiChiTiet)
                .query(
                    `UPDATE EmailOtp SET ConsumedAt=SYSDATETIME() WHERE OtpId=@otpId AND Email=@email AND Purpose='register' AND VerifiedAt IS NOT NULL AND ConsumedAt IS NULL AND ExpiresAt>SYSDATETIME(); IF @@ROWCOUNT=0 THROW 50001,N'Vui lòng xác thực email trước khi đăng ký.',1; INSERT NguoiDung(HoTen,Email,SoDienThoai,MatKhau,TinhThanh,QuanHuyen,PhuongXa,DiaChiChiTiet,NgayDongYDieuKhoan) OUTPUT INSERTED.MaNguoiDung VALUES(@name,@email,@phone,@pass,@tt,@qh,@px,@dc,SYSDATETIME())`,
                );
            await tx.commit();
            return r.recordset[0];
        } catch (e) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error('Registration transaction rollback failed:', rollbackError);
            }
            throw e;
        }
    }
    async resetPassword(email, otpId, hash) {
        const p = await poolPromise;
        const tx = new sql.Transaction(p);
        await tx.begin();
        try {
            const r = await tx
                .request()
                .input('otpId', sql.Int, otpId)
                .input('email', sql.VarChar(255), email)
                .input('hash', sql.VarChar(255), hash)
                .query(
                    `UPDATE EmailOtp SET ConsumedAt=SYSDATETIME() WHERE OtpId=@otpId AND Email=@email AND Purpose='reset-password' AND VerifiedAt IS NOT NULL AND ConsumedAt IS NULL AND ExpiresAt>SYSDATETIME(); IF @@ROWCOUNT=0 THROW 50001,N'Mã xác thực không hợp lệ hoặc đã hết hạn.',1; UPDATE NguoiDung SET MatKhau=@hash,NgayCapNhat=SYSDATETIME(),PasswordChangedAt=SYSUTCDATETIME() WHERE Email=@email; IF @@ROWCOUNT=0 THROW 50002,N'Không tìm thấy tài khoản.',1;`,
                );
            await tx.commit();
            return r.rowsAffected;
        } catch (e) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error('Password reset transaction rollback failed:', rollbackError);
            }
            throw e;
        }
    }
}
module.exports = new NguoiDungDAL();
