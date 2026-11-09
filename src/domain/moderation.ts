import type { ViolationType } from './types';

/**
 * Chat content guard.
 *
 * Blocks phone numbers (digits AND written forms, incl. common Nigerian
 * obfuscations), email addresses, links, and any attempt to move the
 * conversation or payment off Sleek. A blocked message is never sent; the user
 * sees a clear warning and the attempt is logged against their trust record.
 *
 * The backend runs the same check again — the client check is for instant UX.
 */

export interface ModerationResult {
  allowed: boolean;
  violations: ViolationType[];
  /** Human friendly explanation shown to the user. */
  warning?: string;
  /** Text with the offending parts masked (stored for admin review). */
  redacted: string;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', nought: '0', nil: '0', odo: '0', // odo = Yoruba
  one: '1', won: '1', ookan: '1', ofu: '1', daya: '1',
  two: '2', too: '2', to: '2', meji: '2', abuo: '2', biyu: '2',
  three: '3', tree: '3', meta: '3', ato: '3', uku: '3',
  four: '4', for: '4', fo: '4', merin: '4', ano: '4', hudu: '4',
  five: '5', fife: '5', marun: '5', ise: '5', biyar: '5',
  six: '6', sicks: '6', mefa: '6', isii: '6', shida: '6',
  seven: '7', sevin: '7', meje: '7', asaa: '7', bakwai: '7',
  eight: '8', ate: '8', mejo: '8', asato: '8', takwas: '8',
  nine: '9', nain: '9', mesan: '9', itoolu: '9', tara: '9',
  double: 'D', triple: 'T', // "double seven" => 77
};

// Words that are ambiguous in normal English. They only count as digits when
// they sit next to other digit words/digits (handled by the run logic below).
const WEAK_DIGIT_WORDS = new Set(['o', 'oh', 'to', 'too', 'for', 'fo', 'won', 'ate', 'tree', 'nil', 'ise', 'ato', 'uku', 'ano', 'tara', 'meta', 'odo', 'ofu']);

/** Lookalike characters commonly used to sneak numbers past filters. */
const LOOKALIKES: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  l: '1', I: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2',
  E: '3',
  A: '4',
  S: '5', s: '5', $: '5',
  G: '6', b: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

const OFF_APP_PATTERNS: { re: RegExp; type: ViolationType }[] = [
  // messaging / social platforms
  { re: /\b(whats\s*app|whatsap+|watsap+|whatsup|wassap|wa\.me|w\/app|whtsp|watzap)\b/i, type: 'off_app' },
  { re: /\b(telegram|tele\s*gram|t\.me|signal\s*app|imo|viber|wechat|snap\s*chat|snapchat|tiktok|tik\s*tok|threads)\b/i, type: 'off_app' },
  { re: /\b(insta\s*gram|instagram|insta|ig\s*handle|my\s*ig|on\s*ig|facebook|fb\s*page|on\s*fb|messenger|twitter|x\s*handle|linkedin)\b/i, type: 'off_app' },
  { re: /(^|\s)@[a-z0-9_.]{3,}/i, type: 'off_app' }, // @handles
  // calls / direct contact
  { re: /\b(call|ring|flash|buzz|text|sms|dm|holla|whatsapp)\s+(me|you|u|am)\b/i, type: 'off_app' },
  { re: /\b(my|your|ur|ya|send\s*(me\s*)?(your|ur))\s*(phone|fone|number|numba|nomba|digits|line|contact|handle|email|mail|gmail)\b/i, type: 'off_app' },
  { re: /\b(phone|fone|mobile)\s*(number|no\.?|numba|nomba)\b/i, type: 'off_app' },
  { re: /\b(outside|off)\s*(the\s*)?(app|sleek|platform)\b/i, type: 'off_app' },
  { re: /\b(meet|see)\s+(me\s+)?(outside|privately|offline)\b/i, type: 'off_app' },
  { re: /\bvoice\s*(call|note)\b|\bvideo\s*call\b/i, type: 'off_app' },
  // off-platform payment (escrow bypass)
  { re: /\b(pay|send|transfer)\s*(me\s*)?(directly|direct|cash|to\s*my\s*(account|acct|bank|opay|palmpay|kuda|moniepoint))\b/i, type: 'off_app_payment' },
  { re: /\b(account|acct|acc)\s*(number|no\.?|num|details)\b/i, type: 'off_app_payment' },
  { re: /\b(opay|palm\s*pay|palmpay|moniepoint|kuda|bank\s*transfer|pos\s*transfer|ussd|chipper|paga)\b/i, type: 'off_app_payment' },
  { re: /\b(cancel|cancle)\s*(it\s*)?(on\s*)?(the\s*)?(app|sleek)\b.*\b(pay|cash|transfer)/i, type: 'off_app_payment' },
  { re: /\b(no\s*need\s*(for|of)\s*(the\s*)?(app|escrow|sleek))\b/i, type: 'off_app_payment' },
];

const EMAIL_RE = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\{at\}|\sat\s)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}/i;
const EMAIL_PROVIDER_RE = /\b(gmail|yahoo|hotmail|outlook|icloud|ymail|proton\s*mail|protonmail)\b/i;
const SPOKEN_LINK_RE = /\bdot\s*(com|ng|net|org|io)\b/i;
const LINK_RE = /\b((https?:\/\/)|(www\.))\S+|\b[a-z0-9-]{2,}\.(com|ng|net|org|io|co|me|app|link|ly|xyz|biz|info)(\.ng)?\b/i;

/** Minimum digits that make a phone-like run. Nigerian mobiles are 11 digits, but partial leaks count too. */
const PHONE_DIGIT_THRESHOLD = 7;

function normaliseSpokenDigits(text: string): string {
  // Turn "zero eight zero, three one two..." into "080312"
  const tokens = text.toLowerCase().split(/[\s,.\-_/\\|:;]+/).filter(Boolean);
  let out = '';
  let pendingRepeat: 'D' | 'T' | null = null;
  let run = '';
  let strongInRun = 0;
  let lastWasNumeral = false;
  const flush = () => {
    // Only keep runs that contain at least one unambiguous digit/word.
    if (run.length && strongInRun > 0) out += run;
    out += ' ';
    run = '';
    strongInRun = 0;
  };
  for (const raw of tokens) {
    const tok = raw.replace(/[^a-z0-9]/g, '');
    if (!tok) continue;
    if (/^\d+$/.test(tok)) {
      run += pendingRepeat ? tok.repeat(pendingRepeat === 'D' ? 2 : 3) : tok;
      pendingRepeat = null;
      strongInRun++;
      lastWasNumeral = true;
      continue;
    }
    const mapped = DIGIT_WORDS[tok];
    if (mapped === 'D' || mapped === 'T') {
      pendingRepeat = mapped;
      continue;
    }
    if (mapped && WEAK_DIGIT_WORDS.has(tok) && lastWasNumeral) {
      // "150000 for 2 days" — a weak word right after a numeral is just English.
      pendingRepeat = null;
      lastWasNumeral = false;
      flush();
      continue;
    }
    if (mapped) {
      lastWasNumeral = false;
      run += pendingRepeat ? mapped.repeat(pendingRepeat === 'D' ? 2 : 3) : mapped;
      pendingRepeat = null;
      if (!WEAK_DIGIT_WORDS.has(tok)) strongInRun++;
      continue;
    }
    pendingRepeat = null;
    lastWasNumeral = false;
    flush();
  }
  flush();
  return out;
}

/** Replace lookalike letters only inside tokens that are already mostly digits, e.g. "O8O3l2". */
function normaliseLookalikes(text: string): string {
  return text.replace(/[0-9OoQDlIi|!ZzEASs$GbTBgq+]{7,}/g, (chunk) => {
    const digits = chunk.replace(/\D/g, '').length;
    if (digits < 3) return chunk; // a normal word, not an obfuscated number
    return chunk.split('').map((c) => (/\d/.test(c) ? c : LOOKALIKES[c] ?? c)).join('');
  });
}

/**
 * A run of digits is phone-like when it is long enough. Round amounts such as
 * "1500000" (₦1.5m) are not treated as phone numbers unless they are 10+ digits.
 */
function isPhoneLikeRun(run: string): boolean {
  if (run.length >= 10) return true;
  if (run.length < PHONE_DIGIT_THRESHOLD) return false;
  const looksLikeRoundAmount = !run.startsWith('0') && /000$/.test(run);
  return !looksLikeRoundAmount;
}

function hasPhoneLikeRun(text: string): boolean {
  // Separators people use to split numbers: spaces, dots, dashes, brackets, plus, slashes, stars.
  const compact = text.replace(/[\s.\-()+_/\\*#~,]+/g, '');
  const runs = compact.match(/\d+/g) ?? [];
  return runs.some(isPhoneLikeRun);
}

function hasPhone(text: string): boolean {
  if (/(\+?234|\b0)[789][01]\d([\s.\-]*\d){7}/.test(text)) return true;
  // Digit runs with separators. Money like "15,000" or "₦25000" is allowed — commas/naira
  // are not stripped, so amounts below 7 contiguous digits pass.
  const withoutMoney = text.replace(/(₦|ngn|n)\s?\d[\d,]*(\.\d+)?/gi, ' ').replace(/\b\d{1,3}(,\d{3})+\b/g, ' ');
  if (hasPhoneLikeRun(withoutMoney)) return true;
  if (hasPhoneLikeRun(normaliseLookalikes(withoutMoney))) return true;
  const spoken = normaliseSpokenDigits(withoutMoney);
  return spoken.split(' ').some(isPhoneLikeRun);
}

const WARNINGS: Record<ViolationType, string> = {
  phone_number: 'Phone numbers can’t be shared on Sleek — in any form.',
  email: 'Email addresses can’t be shared on Sleek.',
  link: 'Links can’t be shared in chat.',
  off_app: 'Please keep the conversation inside Sleek. Moving off the app removes your escrow protection.',
  off_app_payment: 'All payments must go through Sleek Escrow. Direct payments are not protected and are not allowed.',
};

export function moderateMessage(text: string): ModerationResult {
  const violations = new Set<ViolationType>();
  const trimmed = text.trim();

  if (hasPhone(trimmed)) violations.add('phone_number');
  if (EMAIL_RE.test(trimmed) || (EMAIL_PROVIDER_RE.test(trimmed) && /\b(at|@|dot|mail)\b/i.test(trimmed))) {
    violations.add('email');
  }
  if (LINK_RE.test(trimmed) || SPOKEN_LINK_RE.test(trimmed)) violations.add('link');
  for (const { re, type } of OFF_APP_PATTERNS) {
    if (re.test(trimmed)) violations.add(type);
  }

  const list = [...violations];
  const allowed = list.length === 0;
  return {
    allowed,
    violations: list,
    warning: allowed
      ? undefined
      : `${list.map((v) => WARNINGS[v]).filter((w, i, a) => a.indexOf(w) === i).join(' ')} This message was not sent and the attempt has been logged.`,
    redacted: allowed ? trimmed : redact(trimmed),
  };
}

export function redact(text: string): string {
  return text
    .replace(/\d/g, '•')
    .replace(EMAIL_RE, '[email removed]')
    .replace(LINK_RE, '[link removed]')
    .slice(0, 160);
}

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  phone_number: 'Phone number',
  email: 'Email address',
  link: 'External link',
  off_app: 'Off-app contact attempt',
  off_app_payment: 'Off-app payment attempt',
};
