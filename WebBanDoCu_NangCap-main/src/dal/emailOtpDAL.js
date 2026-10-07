const crypto = require('crypto');
const { poolPromise, sql } = require('./dbConfig');

class EmailOtpDAL {
    async create(email, purpose, codeHash) {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        try {
            await transaction.request().query('DELETE FROM EmailOtp WHERE CreatedAt<DATEADD(DAY,-2,SYSDATETIME())');
            const recent = await transaction
                .request()
                .input('email', sql.VarChar(255), email)
                .input('purpose', sql.VarChar(24), purpose)
                .query(`SELECT TOP 1 OtpId FROM EmailOtp WITH(UPDLOCK,HOLDLOCK)
                        WHERE Email=@email AND Purpose=@purpose AND CreatedAt>DATEADD(SECOND,-60,SYSDATETIME())
                          AND ConsumedAt IS NULL ORDER BY CreatedAt DESC`);
            if (recent.recordset.length) throw new Error('Vui lòng đợi 60 giây trước khi yêu cầu mã mới.');

            const result = await transaction
                .request()
                .input('email', sql.VarChar(255), email)
                .input('purpose', sql.VarChar(24), purpose)
                .input('hash', sql.Char(64), codeHash).query(`UPDATE EmailOtp SET ConsumedAt=SYSDATETIME()
                        WHERE Email=@email AND Purpose=@purpose AND ConsumedAt IS NULL;
                        INSERT EmailOtp(Email,Purpose,CodeHash,ExpiresAt)
                        OUTPUT INSERTED.OtpId
                        VALUES(@email,@purpose,@hash,DATEADD(MINUTE,10,SYSDATETIME()));`);
            await transaction.commit();
            return result.recordset[0].OtpId;
        } catch (error) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('OTP transaction rollback failed:', rollbackError);
            }
            throw error;
        }
    }

    async verify(email, purpose, codeHash) {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        let failure = '';
        let verifiedOtpId = null;

        try {
            const result = await transaction
                .request()
                .input('email', sql.VarChar(255), email)
                .input('purpose', sql.VarChar(24), purpose)
                .query(`SELECT TOP 1 OtpId,CodeHash,Attempts FROM EmailOtp WITH(UPDLOCK,ROWLOCK)
                        WHERE Email=@email AND Purpose=@purpose AND ConsumedAt IS NULL
                          AND ExpiresAt>SYSDATETIME() AND VerifiedAt IS NULL
                        ORDER BY CreatedAt DESC`);
            const otp = result.recordset[0];
            const expectedHash = otp ? Buffer.from(otp.CodeHash, 'hex') : Buffer.alloc(0);
            const suppliedHash = Buffer.from(codeHash, 'hex');
            const matches =
                expectedHash.length === suppliedHash.length && crypto.timingSafeEqual(expectedHash, suppliedHash);

            if (!otp) {
                failure = 'Mã xác thực không hợp lệ hoặc đã hết hạn.';
            } else if (otp.Attempts >= 5) {
                failure = 'Bạn đã nhập sai mã quá nhiều lần. Hãy yêu cầu mã mới.';
            } else if (!matches) {
                await transaction
                    .request()
                    .input('id', sql.Int, otp.OtpId)
                    .query('UPDATE EmailOtp SET Attempts=Attempts+1 WHERE OtpId=@id');
                failure = 'Mã xác thực không chính xác.';
            } else {
                await transaction
                    .request()
                    .input('id', sql.Int, otp.OtpId)
                    .query('UPDATE EmailOtp SET VerifiedAt=SYSDATETIME() WHERE OtpId=@id AND VerifiedAt IS NULL');
                verifiedOtpId = otp.OtpId;
            }

            await transaction.commit();
        } catch (error) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('OTP transaction rollback failed:', rollbackError);
            }
            throw error;
        }

        if (failure) throw new Error(failure);
        return verifiedOtpId;
    }

    async invalidate(id) {
        const pool = await poolPromise;
        await pool
            .request()
            .input('id', sql.Int, id)
            .query('UPDATE EmailOtp SET ConsumedAt=SYSDATETIME() WHERE OtpId=@id AND ConsumedAt IS NULL');
    }
}

module.exports = new EmailOtpDAL();
