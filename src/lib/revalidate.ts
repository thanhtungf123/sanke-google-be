// Gọi frontend (Next.js) xoá cache theo tag NGAY sau khi admin lưu, để nội dung
// công khai hiện tức thì (không phải đợi ISR 60s). Fire-and-forget: không chặn response.
//
// Yêu cầu: frontend có route POST /revalidate (app/revalidate/route.ts).
// Bảo mật (tuỳ chọn): đặt REVALIDATE_SECRET giống nhau ở cả backend và frontend.
export type RevalidateTag = 'content' | 'settings' | 'pages';

export function revalidateFrontend(tag: RevalidateTag): void {
  // Ưu tiên REVALIDATE_URL (vd http://127.0.0.1:3000 — gọi nội bộ, khỏi vòng qua CDN),
  // mặc định lấy origin đầu tiên của FRONTEND_URL.
  const base = (process.env.REVALIDATE_URL || process.env.FRONTEND_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');

  if (base) {
    // Dấu '/' cuối khớp next.config trailingSlash:true (tránh 308 redirect làm mất body POST).
    fetch(`${base}/revalidate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, secret: process.env.REVALIDATE_SECRET || '' }),
    }).catch((e) => console.warn('[revalidate] không gọi được frontend:', (e as Error).message));
  }

  // Xoá luôn cache Cloudflare (edge) để nội dung mới hiện ngay — nếu không purge, bản HTML
  // cũ vẫn được CDN trả về tới khi hết TTL dù Next đã revalidate.
  purgeCloudflare();
}

// Purge toàn bộ cache Cloudflare. Chỉ chạy khi có CLOUDFLARE_ZONE_ID + CLOUDFLARE_API_TOKEN;
// không cấu hình thì bỏ qua (no-op). Fire-and-forget, không chặn response admin.
function purgeCloudflare(): void {
  const zone = (process.env.CLOUDFLARE_ZONE_ID || '').trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!zone || !token) return;

  fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purge_everything: true }),
  }).catch((e) => console.warn('[revalidate] Cloudflare purge lỗi:', (e as Error).message));
}
