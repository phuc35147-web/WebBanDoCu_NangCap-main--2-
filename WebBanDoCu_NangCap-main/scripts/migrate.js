/*
 * Chạy migration + seed thủ công:  npm run migrate
 * Dùng DB_MIGRATE_USER / DB_MIGRATE_PASSWORD (tài khoản có quyền DDL) nếu có, ngược lại dùng DB_USER.
 */
require('dotenv').config();
const sql = require('mssql');

(async () => {
    const { buildConfig } = require('../src/dal/dbOptions');
    const { runMigrations } = require('../src/dal/migrations');
    const user = process.env.DB_MIGRATE_USER;
    const pool = await new sql.ConnectionPool(
        buildConfig(user ? { user, password: process.env.DB_MIGRATE_PASSWORD || '' } : {}),
    ).connect();
    try {
        await runMigrations(pool);
        console.log('✅ Migration hoàn tất.');
    } finally {
        await pool.close();
    }
})().catch((error) => {
    console.error('❌ Migration thất bại:', error);
    process.exit(1);
});
