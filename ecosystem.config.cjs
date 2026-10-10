// PM2 — backend Express (Google Snake API).
// Chạy từ thư mục backend trên VPS:  pm2 start ecosystem.config.cjs
// Biến môi trường đọc từ backend/.env (code dùng `dotenv/config`), nên ở đây
// chỉ cần đặt NODE_ENV. .env KHÔNG commit (đã nằm trong .gitignore).
module.exports = {
  apps: [
    {
      name: 'snake-api',
      cwd: __dirname,
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
