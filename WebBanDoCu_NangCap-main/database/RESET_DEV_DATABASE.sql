/* =========================================================
   CHỈ DÙNG TRÊN MÁY DEV: XÓA TOÀN BỘ database WebBanDoCu
   Sau đó chạy lại database/WebBanDoCu_NEW.sql để tạo mới.
   TUYỆT ĐỐI KHÔNG CHẠY TRÊN SERVER THẬT.
   ========================================================= */
USE master;
GO
IF DB_NAME() <> N'master' RAISERROR(N'Sai ngữ cảnh.',16,1);
GO
IF DB_ID(N'WebBanDoCu') IS NOT NULL
BEGIN
    ALTER DATABASE WebBanDoCu SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE WebBanDoCu;
END
GO
