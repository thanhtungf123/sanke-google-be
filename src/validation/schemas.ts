import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
  nickname: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Chỉ chữ, số và dấu gạch dưới'),
});

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(100),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8).max(100),
});

export const submitScoreSchema = z.object({
  sessionId: z.string().min(1),
  score: z.number().int().min(0).max(100000),
});

// --- Admin ---

export const banUserSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const scoreStatusSchema = z.object({
  status: z.enum(['valid', 'flagged', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

// Nội dung trang (SeoContent). pageKey/locale lấy từ URL params.
export const contentUpsertSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  seoTitle: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().min(1).max(400),
  h1: z.string().trim().min(1).max(200),
  // Hero trang chủ (tuỳ chọn): tiêu đề lớn + mô tả hiển thị trên cùng.
  heroH1: z.string().trim().max(200).optional().default(''),
  heroIntro: z.string().trim().max(400).optional().default(''),
  bodyHtml: z.string().max(20000).optional().default(''),
  canonicalOverride: z.string().trim().max(500).optional(),
  ogTitle: z.string().trim().max(200).optional(),
  ogDescription: z.string().trim().max(400).optional(),
  ogImage: z.string().trim().max(500).optional(),
  robots: z
    .object({ index: z.boolean(), follow: z.boolean() })
    .optional(),
  isPublished: z.boolean().optional(),
});

// --- Nhận thưởng (người thắng điền thông tin chuyển khoản) ---

export const rewardInfoSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên quá ngắn').max(100),
  bankName: z.string().trim().min(2, 'Tên ngân hàng/ví quá ngắn').max(100),
  accountNumber: z
    .string()
    .trim()
    .min(4, 'Số tài khoản quá ngắn')
    .max(40)
    .regex(/^[A-Za-z0-9 .-]+$/, 'Số tài khoản chỉ gồm chữ, số, dấu cách, chấm hoặc gạch ngang'),
  phone: z
    .union([z.string().trim().max(20).regex(/^[0-9+() .-]*$/, 'Số điện thoại không hợp lệ'), z.literal('')])
    .optional(),
  note: z.string().trim().max(300).optional(),
});

// Admin đổi trạng thái phiếu thưởng.
export const rewardStatusSchema = z.object({
  status: z.enum(['pending_info', 'info_submitted', 'paid', 'cancelled']),
  note: z.string().trim().max(300).optional(),
});

// --- Account (tự chỉnh sửa tài khoản của mình) ---

const nicknameField = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_]+$/, 'Chỉ chữ, số và dấu gạch dưới');

export const updateAccountSchema = z.object({
  nickname: nicknameField.optional(),
  email: z.string().email().max(200).optional(),
  // URL ảnh đại diện; cho phép chuỗi rỗng để xoá avatar.
  avatarUrl: z.union([z.string().trim().url().max(500), z.literal('')]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

// --- Cấu hình site (header/footer/favicon) ---
const imageUrlField = z.union([z.string().trim().url().max(600), z.literal('')]).optional().default('');
export const siteSettingsSchema = z.object({
  siteTitle: z.string().trim().max(100).optional().default(''),
  logoUrl: imageUrlField,
  faviconUrl: imageUrlField,
  footerText: z.string().trim().max(300).optional().default(''),
  // Liên kết footer: nhãn + URL. Chấp nhận http(s) HOẶC đường dẫn nội bộ bắt đầu bằng "/".
  footerLinks: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        url: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .refine((v) => /^https?:\/\//i.test(v) || v.startsWith('/'), {
            message: 'URL phải bắt đầu bằng http(s):// hoặc / (đường dẫn nội bộ)',
          }),
      })
    )
    .max(12)
    .optional()
    .default([]),
});

// Trang hệ thống còn chỉnh nội dung/SEO được (how-to-play & about đã gỡ — admin tự tạo trang).
export const CONTENT_PAGE_KEYS = ['home', 'rewards'] as const;
export const CONTENT_LOCALES = ['en', 'vi'] as const;

// --- Trang tùy chỉnh (CustomPage) ---

// Slug trùng với route hệ thống sẽ bị route tĩnh "che" → cấm để tránh trang tạo ra không truy cập được.
// Gồm cả slug EN và VI của mọi route công khai + các path kỹ thuật.
export const RESERVED_SLUGS = new Set<string>([
  'leaderboard', 'bang-xep-hang',
  'rewards', 'phan-thuong',
  'login', 'dang-nhap',
  'register', 'dang-ky',
  'forgot-password', 'quen-mat-khau',
  'reset-password', 'dat-lai-mat-khau',
  'profile', 'ho-so',
  'stats', 'thong-ke',
  'history', 'lich-su',
  'account', 'tai-khoan',
  'inbox', 'hop-thu',
  'my-rewards', 'phan-thuong-cua-toi',
  'achievements', 'thanh-tich',
  'challenges', 'thu-thach',
  'admin', 'api', 'p', '_next', 'en', 'vi',
  'sitemap', 'sitemap.xml', 'robots', 'robots.txt', 'revalidate', 'legacy-mods',
]);

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang')
  .refine((v) => !RESERVED_SLUGS.has(v), {
    message: 'Slug này trùng với đường dẫn hệ thống, vui lòng chọn slug khác',
  });

const keyField = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Key chỉ gồm chữ thường, số và dấu gạch ngang');

// Tạo mới: 1 key + 1 hay nhiều ngôn ngữ (ô tick EN/VI). Nội dung nhập ở ngôn ngữ chính
// (EN nếu có chọn EN, ngược lại VI); bản dịch còn lại được tạo thành bản nháp để admin tự dịch.
export const customPageCreateSchema = z.object({
  key: keyField,
  locales: z
    .array(z.enum(CONTENT_LOCALES))
    .min(1, 'Chọn ít nhất một ngôn ngữ (EN hoặc VI)')
    .max(2),
  slug: slugField,
  title: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().max(400).optional().default(''),
  h1: z.string().trim().min(1).max(200),
  bodyHtml: z.string().max(20000).optional().default(''),
  robots: z.object({ index: z.boolean(), follow: z.boolean() }).optional(),
  isPublished: z.boolean().optional(),
});

export const customPageUpdateSchema = z.object({
  slug: slugField,
  title: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().max(400).optional().default(''),
  h1: z.string().trim().min(1).max(200),
  bodyHtml: z.string().max(20000).optional().default(''),
  robots: z.object({ index: z.boolean(), follow: z.boolean() }).optional(),
  isPublished: z.boolean().optional(),
});
