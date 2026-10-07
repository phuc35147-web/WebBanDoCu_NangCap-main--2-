class AppError extends Error {
    constructor(message, statusCode = 500, options = {}) {
        super(message, options);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.isOperational = true;
    }

    static from(error, fallbackStatus = 500) {
        if (error instanceof AppError) return error;

        const candidate = Number(error && (error.statusCode || error.status));
        const statusCode =
            candidate >= 400 && candidate <= 599 ? candidate : error && error.code ? 500 : fallbackStatus;
        return new AppError(error && error.message ? error.message : 'Lỗi máy chủ.', statusCode, { cause: error });
    }
}

module.exports = AppError;
