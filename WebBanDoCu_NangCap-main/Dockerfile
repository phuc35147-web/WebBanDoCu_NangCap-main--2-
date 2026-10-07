FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# sharp (xóa EXIF / resize ảnh) có bản build sẵn cho alpine; nếu cài lỗi ứng dụng vẫn chạy nhưng ảnh không được xử lý
RUN npm install --omit=dev
COPY . .
RUN mkdir -p uploads private-uploads && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "server.js"]
