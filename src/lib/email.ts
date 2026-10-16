import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

// Gửi email (đặt lại mật khẩu…). Chọn nhà cung cấp theo thứ tự ưu tiên:
//   1) Gmail SMTP  — khi có GMAIL_USER + GMAIL_APP_PASSWORD (App Password 16 ký tự).
//   2) Resend      — khi có RESEND_API_KEY.
//   3) Không gì cả — chỉ log ra console (tiện dev/demo, KHÔNG gửi thật).
// Dùng App Password của Gmail, KHÔNG dùng mật khẩu đăng nhập thường (xem hướng dẫn ở .env.example).

let gmailTx: Transporter | null = null;
function getGmail(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!gmailTx) {
    gmailTx = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL
      auth: { user, pass: pass.replace(/\s+/g, '') }, // App Password thường hiển thị có khoảng trắng
    });
  }
  return gmailTx;
}

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

// Địa chỉ người gửi. Với Gmail, "from" PHẢI là chính địa chỉ Gmail đã xác thực
// (có thể kèm tên hiển thị), nếu không Gmail sẽ ghi đè/từ chối.
function resolveFrom(viaGmail: boolean): string {
  if (viaGmail) {
    const user = process.env.GMAIL_USER!;
    return process.env.EMAIL_FROM?.includes(user)
      ? process.env.EMAIL_FROM
      : `Snake <${user}>`;
  }
  return process.env.EMAIL_FROM || 'Snake <onboarding@resend.dev>';
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  // 1) Gmail SMTP
  const gmail = getGmail();
  if (gmail) {
    await gmail.sendMail({
      from: resolveFrom(true),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return;
  }

  // 2) Resend
  const resend = getResend();
  if (resend) {
    const { error } = await resend.emails.send({
      from: resolveFrom(false),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) throw new Error(`Gửi email thất bại: ${error.message ?? String(error)}`);
    return;
  }

  // 3) Không cấu hình nhà cung cấp nào — chỉ log (dev/demo).
  console.warn(
    `[email] Chưa cấu hình GMAIL_* hoặc RESEND_API_KEY — bỏ qua gửi thật. To=${input.to} Subject="${input.subject}"`
  );
  if (input.text) console.warn(`[email] (nội dung text)\n${input.text}`);
}
