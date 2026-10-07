import sanitizeHtmlLib from 'sanitize-html';

// Allowlist nội dung CMS (bodyHtml). Chỉ cho các thẻ trình bày cơ bản —
// đủ để biên tập viên viết nội dung, nhưng chặn <script>, inline event,
// iframe, style… nên dù admin nhập (hoặc DB bị can thiệp) cũng không XSS được.
// Giữ đồng bộ với gợi ý hiển thị trong AdminContent.tsx.
const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div',
    'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'strike',
    'blockquote', 'code', 'pre', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    span: ['class'],
    code: ['class'],
    pre: ['class'],
  },
  // Chỉ cho link an toàn; chặn javascript:, data:… (trừ ảnh thì cũng không cho vì không có <img>).
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Mọi link ra ngoài đều rel=noopener và không mang referrer, tránh tabnabbing.
  transformTags: {
    a: (tagName, attribs) => {
      const rel = new Set((attribs.rel ?? '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      if (attribs.target === '_blank') rel.add('nofollow');
      return { tagName, attribs: { ...attribs, rel: Array.from(rel).join(' ') } };
    },
  },
};

// Trả về HTML đã làm sạch. Input không phải chuỗi => chuỗi rỗng.
export function sanitizeBodyHtml(html: unknown): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  return sanitizeHtmlLib(html, OPTIONS);
}
