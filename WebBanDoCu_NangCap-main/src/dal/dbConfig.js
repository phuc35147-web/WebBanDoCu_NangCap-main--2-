require('dotenv').config();
const sql = require('mssql');

const { buildConfig, flag, isProduction } = require('./dbOptions');

/* Chạy migration bằng tài khoản riêng (DB_MIGRATE_USER) nếu có, để tài khoản ứng dụng không cần quyền DDL */
async function migrate(pool) {
    const { runMigrations } = require('./migrations');
    const user = process.env.DB_MIGRATE_USER;
    if (!user) return runMigrations(pool);
    const migratePool = await new sql.ConnectionPool(
        buildConfig({ user, password: process.env.DB_MIGRATE_PASSWORD || '' }),
    ).connect();
    try {
        await runMigrations(migratePool);
    } finally {
        await migratePool.close();
    }
}

const autoMigrate = flag('AUTO_MIGRATE', !isProduction);

const poolPromise = new sql.ConnectionPool(buildConfig())
    .connect()
    .then(async (pool) => {
        console.log('✅ SQL Server: ' + (process.env.DB_NAME || 'WebBanDoCu'));
        if (autoMigrate) await migrate(pool);
        else console.log('ℹ️  AUTO_MIGRATE đang tắt: dùng `npm run migrate` khi cần cập nhật cấu trúc DB.');
        return pool;
    })
    .catch((err) => {
        console.error('❌ SQL:', err.message);
        throw err;
    });

module.exports = { sql, poolPromise, migrate };
