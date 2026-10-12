// Kiểm tra URL nhúng game. Chỉ chấp nhận iframe từ GamePix (*.gamepix.com) qua https,
// để admin dán link nhúng có sẵn từ my.gamepix.com nhưng không nhúng được nguồn lạ (chống XSS/clickjacking).
// Muốn thêm nguồn khác sau này thì bổ sung vào ALLOWED_EMBED_HOSTS.
export const ALLOWED_EMBED_HOSTS = ['gamepix.com'] as const;

function hostIsAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_EMBED_HOSTS.some((base) => h === base || h.endsWith(`.${base}`));
}

// Trả về URL đã chuẩn hoá nếu hợp lệ, hoặc null nếu không. Chuỗi rỗng => '' (game chưa gắn iframe).
export function normalizeEmbedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v === '') return '';
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!hostIsAllowed(u.hostname)) return null;
  return u.toString();
}
