// Mốc thời gian theo múi giờ Asia/Ho_Chi_Minh (UTC+7, không DST).
// Dùng cho thống kê theo ngày/tuần/tháng (V2) và key mùa giải YYYY-MM (V3).
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

// Dịch về "giờ ICT": các trường getUTC* của Date trả về biểu diễn giờ ICT.
function toIct(d: Date): Date {
  return new Date(d.getTime() + ICT_OFFSET_MS);
}

// Chuyển mốc (tính theo trường ICT) ngược về Date UTC thật.
function fromIctMs(ms: number): Date {
  return new Date(ms - ICT_OFFSET_MS);
}

// 00:00 ICT của ngày chứa `now`.
export function startOfDayICT(now: Date = new Date()): Date {
  const s = toIct(now);
  return fromIctMs(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
}

// 00:00 ICT của thứ Hai trong tuần chứa `now` (tuần bắt đầu từ thứ Hai).
export function startOfWeekICT(now: Date = new Date()): Date {
  const s = toIct(now);
  const dow = s.getUTCDay(); // 0 = CN … 6 = T7
  const diff = (dow + 6) % 7; // số ngày kể từ thứ Hai
  return fromIctMs(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - diff));
}

// 00:00 ICT ngày 1 của tháng chứa `now`.
export function startOfMonthICT(now: Date = new Date()): Date {
  const s = toIct(now);
  return fromIctMs(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
}

// Key mùa giải "YYYY-MM" theo tháng dương lịch ICT (dùng cho V3).
export function monthKeyICT(now: Date = new Date()): string {
  const s = toIct(now);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}`;
}
