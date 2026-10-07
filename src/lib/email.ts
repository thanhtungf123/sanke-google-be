import { Resend } from 'resend';

// Gửi email qua Resend.
// - Nếu thiếu RESEND_API_KEY: KHÔNG gửi thật, chỉ log ra console (tiện dev/demo).
// - EMAIL_FROM mặc định dùng domain thử nghiệm của Resend (onboarding@resend.dev).
let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM || 'Snake <onboarding@resend.dev>';
  const c = getClient();
  if (!c) {
    console.warn(
      `[email] RESEND_API_KEY chưa cấu hình — bỏ qua gửi thật. To=${input.to} Subject="${input.subject}"`
    );
    if (input.text) console.warn(`[email] (nội dung text)\n${input.text}`);
    return;
  }
  const { error } = await c.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) {
    throw new Error(`Gửi email thất bại: ${error.message ?? String(error)}`);
  }
}
