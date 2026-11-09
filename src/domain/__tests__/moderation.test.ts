import { moderateMessage } from '../moderation';

const blocked = (t: string) => moderateMessage(t).allowed === false;

describe('chat moderation — blocks', () => {
  it.each([
    '08031234567',
    '+234 803 123 4567',
    '0803-123-4567',
    '0 8 0 3 1 2 3 4 5 6 7',
    '0803.123.4567',
    '(0803) 123 4567',
    'zero eight zero three one two three four five six seven',
    'oh eight oh, three one two, four five six seven',
    'zero eight zero 3 1 2 four five 6 7 8',
    'O8O3l234567',
    'double seven, zero eight one two three four',
    'odo mejo odo meta ookan meji meta merin', // Yoruba digits
  ])('phone number: %s', (t) => {
    const r = moderateMessage(t);
    expect(r.allowed).toBe(false);
    expect(r.violations).toContain('phone_number');
  });

  it.each(['amaka.j@gmail.com', 'amaka at gmail dot com', 'amaka [at] yahoo [dot] com', 'tunde(at)outlook(dot)com'])('email: %s', (t) => {
    expect(moderateMessage(t).violations).toContain('email');
  });

  it.each([
    'Let us talk on WhatsApp',
    'whatsap me',
    'chat me on watsapp',
    'Send me your number',
    'what is your phone number',
    'Call me when you reach',
    'Find me on Instagram @tunde_fix',
    'add me on telegram',
    'let us continue outside the app',
    'my IG is tundefixes',
  ])('off-app attempt: %s', (t) => {
    expect(blocked(t)).toBe(true);
  });

  it.each([
    'Just pay me directly and cancel on the app',
    'transfer to my opay',
    'send it to my account number',
    'no need for the escrow, pay cash',
  ])('off-app payment: %s', (t) => {
    expect(moderateMessage(t).violations).toContain('off_app_payment');
  });

  it.each(['visit www.tundefix.com', 'see tundefix.ng for my prices', 'https://wa.me/23480'])('links: %s', (t) => {
    expect(blocked(t)).toBe(true);
  });

  it('returns a warning and a redacted excerpt', () => {
    const r = moderateMessage('my number na 08031234567');
    expect(r.warning).toMatch(/not sent/);
    expect(r.redacted).not.toMatch(/\d/);
  });

  it('redacts spelled-out numbers in the admin excerpt', () => {
    const r = moderateMessage('call me on zero eight zero three one two three four five six seven');
    expect(r.redacted).not.toMatch(/zero|eight|three|seven/);
  });
});

describe('chat moderation — allows normal job talk', () => {
  it.each([
    'Good morning, I can come by 10am tomorrow',
    'The price is ₦15,000 for the full service',
    'I will charge 150000 for 2 days',
    'The full renovation is 1500000 naira',
    'Can you come at two to four?',
    'It needs 2 new brake pads and 4 plugs',
    'I live on the 3rd floor, flat 12',
    'I will be there for 3 hours',
    'Please bring the toolbox too',
    'One of the sockets in room two is sparking',
    'Thank you, I will approve once I check the work',
  ])('%s', (t) => {
    const r = moderateMessage(t);
    expect({ t, v: r.violations }).toEqual({ t, v: [] });
  });
});
