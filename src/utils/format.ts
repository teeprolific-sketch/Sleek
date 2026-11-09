/** Formatting helpers that don't depend on full Intl support (Hermes on low-end Android). */

export function naira(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const whole = Math.round(Math.abs(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}₦${whole}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function time(iso: string | Date): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${m.toString().padStart(2, '0')}${ap}` : `${h}${ap}`;
}

export function day(iso: string | Date, now = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function windowLabel(w: { start: string; end: string }, now = Date.now()): string {
  const sameDay = new Date(w.start).toDateString() === new Date(w.end).toDateString();
  return sameDay
    ? `${day(w.start, now)}, ${time(w.start)} – ${time(w.end)}`
    : `${day(w.start, now)} ${time(w.start)} → ${day(w.end, now)} ${time(w.end)}`;
}

export function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const fmt = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'}`;
  let s: string;
  if (mins < 1) return 'just now';
  if (mins < 60) s = fmt(mins, 'min');
  else if (mins < 60 * 24) s = fmt(Math.round(mins / 60), 'hour');
  else s = fmt(Math.round(mins / 1440), 'day');
  return diff > 0 ? `in ${s}` : `${s} ago`;
}

export function countdown(iso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length >= 4 ? `•••• ••• ${d.slice(-4)}` : phone;
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function shortRef(id: string): string {
  return id.replace(/^[a-z]+_/, '').slice(-6).toUpperCase();
}
