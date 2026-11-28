/**
 * Sleek policies, shown in the app and agreed to at sign-up.
 *
 * DRAFT FOR REVIEW. Written from how Sleek works today. Items in [square brackets]
 * must be filled in by Sleek / Me AI, and the whole text should be reviewed by a
 * Nigerian lawyer before launch (NDPA 2023, FCCPA 2018, CBN rules on payments).
 * Penalty amounts are Sleek's defaults and can be changed with notice.
 */

export const POLICY_VERSION = '2026-11-28';

export type PolicyId = 'privacy' | 'customer' | 'artisan' | 'team' | 'agency' | 'seller';

export interface PolicySection {
  heading: string;
  body: string[];
}
export interface Policy {
  id: PolicyId;
  title: string;
  summary: string;
  sections: PolicySection[];
}

const PENALTY_NOTE = 'Penalties are Sleek’s standard defaults. Sleek may change them with at least 14 days’ notice in the app and by email. Sleek applies them consistently, using the job timeline, chat history, location check-ins and photos, and you can appeal any penalty through Support within 7 days.';

const COMMON_MONEY: PolicySection = {
  heading: 'Money: upfront fees, Sleek Hold and commission',
  body: [
    'Every booking starts with one upfront fee chosen by the artisan for that trade: a booking fee, a consultancy fee or an inspection fee. Sleek suggests the type for each trade; the artisan sets the amount (₦500 to ₦200,000) and may change it for a job until the customer pays it.',
    'The upfront fee is paid before the artisan engages and waits in Sleek Hold. A booking or consultancy fee is released to the artisan when they respond with a price; an inspection fee is released when the inspection is done. It is refunded in full if the artisan declines or does not respond within 24 hours.',
    'The price for the work is agreed in the in-chat Price Pool and is paid into Sleek Hold before the work starts. It stays in Sleek Hold until the customer approves the work, or until it is released automatically 24, 48 or 72 hours after proof of work (depending on job size) if the customer does not respond.',
    'Sleek keeps a 20% commission on every fee and every job payment, including upfront fees and Sleek Services sales. Tips go 100% to the artisan.',
    'Money in Sleek Hold is held through Sleek’s licensed payment partner, not in a personal account. [Name of licensed payment / escrow partner].',
  ],
};

const COMMON_CONDUCT: PolicySection = {
  heading: 'Keeping everything inside Sleek',
  body: [
    'Phone numbers, emails, links, social handles and requests to pay outside Sleek are blocked in chat, listings, reviews and photos. Both phone numbers and the exact address unlock automatically once the payment is in Sleek Hold.',
    'Every blocked attempt is recorded. 5 attempts in 30 days suspends the account automatically. Arranging or completing a job outside Sleek after meeting on Sleek leads to permanent removal, and the job is not covered by Sleek Hold or Sleek Protection.',
    'Harassment, threats, discrimination, fraud or any unsafe behaviour leads to immediate suspension while Sleek investigates, and may be reported to the police.',
  ],
};

export const POLICIES: Policy[] = [
  {
    id: 'privacy',
    title: 'Sleek Privacy Policy',
    summary: 'What Sleek collects about everyone who uses it, why, who it is shared with and your rights. Applies to every account.',
    sections: [
      {
        heading: 'Who we are',
        body: [
          'Sleek is an artisan marketplace operated by [Me AI legal entity name], RC [number], [registered address], Nigeria ("Sleek", "we"). We are the data controller for personal data processed through the Sleek app, the Sleek website and the Sleek admin console.',
          'Data Protection Officer: [name], [privacy contact email]. You can also write to us through Support in the app.',
          'This policy follows the Nigeria Data Protection Act 2023 (NDPA) and the guidance of the Nigeria Data Protection Commission (NDPC).',
        ],
      },
      {
        heading: 'What we collect',
        body: [
          'Account details: name, phone number, email address, city and area, account type, and how you signed in (phone, Google, Apple or email). If you sign in with Google or Apple we receive only your name and email address.',
          'Identity verification: your NIN, a live selfie and liveness video, and a face-match result. Verification is carried out by our licensed identity partner. Sleek keeps only the result, the last 4 digits of the NIN and a one-way fingerprint of the NIN (so one NIN cannot open two accounts). We do not keep your full NIN or your face images after the check.',
          'Professional accounts also give us: skill videos recorded live in the app, certificates where needed, guarantor details (name, phone, relationship, occupation), CAC registration details for teams, agencies and sellers, and payout bank details (we keep the bank name, last 4 digits and the verified account name; the full number is held by our payment partner).',
          'Jobs and orders: what you book or sell, descriptions, photos, prices, fees, payment status, ratings, reviews, disputes and the job timeline.',
          'Chat and support: messages in job chats and support conversations. Messages and photos are checked automatically for contact details before they are delivered.',
          'Location: your area at all times; your exact address only after payment is in Sleek Hold; live location only during an active delivery or an artisan’s trip to you, and only while that trip is active.',
          'Payments: payment method type, amount, reference and status. Card details are handled by our payment partner and never reach Sleek.',
          'Device and safety data: device type, app version, sign-in times, IP address and approximate location, used to secure accounts and stop fraud.',
        ],
      },
      {
        heading: 'Why we use it (and our legal basis)',
        body: [
          'To run the service you asked for: accounts, bookings, Sleek Hold, payouts, deliveries and support (contract).',
          'To keep people safe and stop fraud: identity checks, guarantor checks, blocking contact sharing, detecting fake or duplicate accounts, investigating safety reports and disputes (legitimate interests and legal obligation).',
          'To meet legal duties: tax, accounting, anti-money-laundering and responding to lawful requests from authorities (legal obligation).',
          'To improve Sleek: matching, pricing guidance and fraud models, using data that is aggregated or de-identified where possible (legitimate interests).',
          'Marketing messages only with your consent. You can switch them off at any time in Notification settings.',
          'Biometric data (face images) is sensitive personal data. We process it only for identity verification, with your explicit consent given when you start the face check.',
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          'Other users, only what the job needs: customers see an artisan’s name, photo, verified skills, ratings and area; artisans see a customer’s first name, area and rating. Phone numbers and the exact address are shared only after payment is in Sleek Hold.',
          'Service providers acting for Sleek under contract: payments (e.g. Paystack), identity verification (e.g. Smile ID), SMS (e.g. Termii), email (e.g. Resend), maps (e.g. Google Maps Platform), secure file storage (e.g. Cloudflare R2), photo text checks (e.g. Google Cloud Vision) and Sleek riders for deliveries. [Final provider list].',
          'Your guarantor is contacted to confirm they vouch for you.',
          'Authorities, when the law requires it or to protect someone’s safety.',
          'Ugent, Me AI’s personal assistant, only if you link it yourself; it can act only with your confirmation and you can unlink it at any time.',
          'We do not sell personal data.',
        ],
      },
      {
        heading: 'Transfers outside Nigeria',
        body: ['Some providers store or process data outside Nigeria. When they do, we rely on the safeguards allowed by the NDPA (adequacy, contractual clauses or your consent) and we choose providers with strong security. [List of countries / safeguards].'],
      },
      {
        heading: 'How long we keep it',
        body: [
          'Account and job records: while your account is open, then 6 years for tax and dispute purposes.',
          'Chat messages: 2 years after the job closes, longer if a dispute or investigation needs them.',
          'Live location during a trip: deleted 30 days after the trip ends unless needed for a safety case or dispute.',
          'Skill videos: while the skill is active on your account, then 1 year.',
          'Identity check results: while the account exists, then 6 years. Face images are not kept by Sleek.',
          'Blocked messages and safety reports: 3 years.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can ask to see your data, correct it, get a copy in a common format, object to some uses, withdraw consent, or delete your account (Settings → Privacy, or through Support). We reply within 30 days.',
          'Some data must be kept after deletion where the law requires it (for example payment records) or to settle open disputes.',
          'You can complain to the Nigeria Data Protection Commission (ndpc.gov.ng).',
        ],
      },
      { heading: 'Security', body: ['Data is encrypted in transit and at rest. Staff access is limited by role, protected by password, personal PIN and one-time code, and every staff action is recorded in an audit log that cannot be deleted. Phone numbers and addresses are hidden from staff unless they record a reason.'] },
      { heading: 'Children', body: ['Sleek accounts are for adults who can enter contracts. Artisans may provide services to households with children (for example tutoring or childcare), but children cannot open accounts.'] },
      { heading: 'Changes', body: ['We will tell you in the app and by email before material changes take effect, and ask you to agree again where the law requires it.'] },
    ],
  },
  {
    id: 'customer',
    title: 'Customer Terms & Rules',
    summary: 'Booking, paying, cancelling and behaving on Sleek as a customer, and the penalties that apply.',
    sections: [
      { heading: 'Verifying your account', body: ['Before you can book, confirm your phone number and pass a quick NIN check where the name on your NIN matches your account name. One person can have one customer account.'] },
      COMMON_MONEY,
      {
        heading: 'Cancelling',
        body: [
          'Before the artisan engages: cancel for free and your upfront fee is refunded.',
          'After the price is paid into Sleek Hold: cancelling 24 hours or more before the job gets a full refund of the job price. Less than 24 hours before: 90% is refunded and 10% goes to the artisan for the time they reserved. Upfront fees already released to the artisan are not refunded.',
        ],
      },
      {
        heading: 'Penalties for customers',
        body: [
          'Not available when the artisan arrives: the artisan waits 30 minutes after checking in and messaging you in the app. After that it counts as a customer no-show: the upfront fee goes to the artisan, 10% of the job price is paid to the artisan for the trip, and the rest is refunded.',
          '3 customer no-shows in 90 days: you must pay the full job price into Sleek Hold before an artisan travels to you, for 60 days.',
          'Contact sharing or off-app payment requests: see “Keeping everything inside Sleek”.',
          'Abusive behaviour towards an artisan or rider, or false claims in a dispute: suspension, and permanent removal for repeat or serious cases.',
          PENALTY_NOTE,
        ],
      },
      { heading: 'Disputes and Sleek Protection', body: ['If the work isn’t right, open a dispute before approving. The money stays frozen in Sleek Hold while Sleek reviews the chat, photos and timeline, usually within 1 to 3 working days. After approval, eligible jobs have Sleek Protection for 7 days, up to ₦50,000.'] },
      COMMON_CONDUCT,
    ],
  },
  {
    id: 'artisan',
    title: 'Artisan Terms & Rules',
    summary: 'Verification, fees, punctuality and quality rules for individual artisans, with the penalties for breaking them.',
    sections: [
      {
        heading: 'Verification before your account opens',
        body: [
          'Your dashboard opens only after every check passes: phone and email confirmed, NIN with the exact name on your account, a random-movement liveness check, a face match with your NIN photo, a guarantor who confirms by SMS, and at least one skill video recorded live in the app showing your face and real work.',
          'Each skill needs its own live video. Uploads from the gallery are not accepted, and a video used on another account is rejected. Checks pass instantly, then the Sleek Trust team audits every account and can revoke a skill or the whole account, with the reason sent by email.',
          'Using someone else’s identity, a fake guarantor or forged documents leads to permanent removal, held earnings are frozen during the investigation, and the case may be reported to the police.',
        ],
      },
      COMMON_MONEY,
      {
        heading: 'Punctuality and penalties',
        body: [
          'Arrive within the agreed time window. If you are running late, tap “I’m on my way” and tell the customer in the app before the window starts.',
          '15–30 minutes late without telling the customer: a warning, and your punctuality score drops (it affects your ranking).',
          '30–60 minutes late: the customer may cancel free and is refunded in full, including the upfront fee, and you get 1 strike. If they still go ahead, 10% of the job price is taken from your payout and given back to the customer.',
          'More than 60 minutes late, or not arriving at all, is a no-show: the customer is refunded in full, a ₦2,000 no-show penalty is deducted from your earnings, and you get 1 strike.',
          'Cancelling a job that is already paid into Sleek Hold: 1 strike, and it lowers your ranking.',
          '3 strikes in 30 days: suspended for 7 days. 5 strikes in 90 days: account review, which can lead to removal.',
          PENALTY_NOTE,
        ],
      },
      {
        heading: 'Quality and disputes',
        body: [
          'Upload proof-of-work photos taken in the app before asking for approval. Losing 3 disputes in 90 days triggers an account review. Approved Sleek Protection claims caused by poor work count as a lost dispute.',
          'The price is locked once agreed. Extra work needs a new agreement in the app; you cannot ask for more money outside Sleek.',
        ],
      },
      { heading: 'Payouts', body: ['Payouts go only to a bank account in your verified name. Released job payments and upfront fees (after 20% commission) appear in Earnings straight away. Changing your payout account triggers extra checks.'] },
      COMMON_CONDUCT,
    ],
  },
  {
    id: 'team',
    title: 'Team Account Terms',
    summary: 'Everything in the Artisan Terms, plus your responsibilities for the workers on your team.',
    sections: [
      { heading: 'Includes the Artisan Terms', body: ['All Artisan Terms & Rules apply to the team account and to every worker on it, including verification, fees, Sleek Hold, punctuality and penalties.'] },
      {
        heading: 'Verification',
        body: [
          'The team leader passes full identity verification and gives a guarantor. Each worker passes their own NIN, liveness and face-match checks and records their own live skill videos before they can be assigned a job.',
          'Sleek asks for your CAC business registration. If you are not registered yet you can still apply; the account is flagged for review and Sleek may limit job volume until it is registered.',
        ],
      },
      {
        heading: 'Your responsibility for workers',
        body: [
          'Only assign a job to the verified worker shown on it. Sending someone who isn’t verified for that skill leads to that person’s permanent removal and a 14-day suspension of the team account.',
          'A worker’s lateness, no-shows and strikes count against the team account as well as the worker.',
          'You must keep worker details up to date and remove workers who leave.',
          PENALTY_NOTE,
        ],
      },
    ],
  },
  {
    id: 'agency',
    title: 'Agency & Enterprise Terms',
    summary: 'For agencies and companies with many workers across trades: business verification, staff responsibility and penalties.',
    sections: [
      { heading: 'Includes the Artisan and Team Terms', body: ['All Artisan Terms & Rules and Team Account Terms apply to the agency and every worker on it.'] },
      {
        heading: 'Business verification',
        body: [
          'Sleek asks for your CAC registration number (RC or BN) and the details of a director or owner, who passes full identity verification and gives a guarantor.',
          'If you are not registered yet you can still apply; the account is flagged and Sleek may cap the number of active jobs until registration is confirmed.',
          'We recommend public liability insurance for agencies. Sleek Protection does not replace your own insurance.',
        ],
      },
      {
        heading: 'Staff and penalties',
        body: [
          'The agency is responsible for its staff’s conduct and quality on Sleek jobs. Strikes, lateness and no-show penalties apply to the agency account as well as the worker.',
          'Repeated unverified workers on jobs, or fraud by staff, can lead to removal of the whole agency account.',
          PENALTY_NOTE,
        ],
      },
    ],
  },
  {
    id: 'seller',
    title: 'Sleek Services Seller Terms',
    summary: 'Rules for selling and renting on Sleek Services: verification, listings, dispatch times, returns and penalties.',
    sections: [
      {
        heading: 'Verification before your store opens',
        body: [
          'Your store opens only after: phone and email confirmed, NIN with the exact account name, liveness and face match, a guarantor who confirms by SMS, and your CAC registration (or “not registered yet”, which is flagged for review).',
          'One person, one seller account. Fake identities or guarantors lead to permanent removal.',
        ],
      },
      {
        heading: 'Listings',
        body: [
          'List only genuine items you have in stock, with honest descriptions, prices and condition. No phone numbers, links or handles in listings or photos.',
          'Counterfeit or misdescribed items: the listing is removed and the payout for that order is held. A second offence leads to permanent removal.',
        ],
      },
      {
        heading: 'Orders, riders and payment',
        body: [
          'Confirm and pack each paid order within 24 hours for the Sleek rider. Hand items only to the rider shown in the app (check the name and plate number).',
          'Sleek keeps a 20% commission on each sale. Payouts go to a bank account in your verified name after delivery is confirmed.',
          'Rental deposits are refunded to the customer within 24 hours of the item coming back in good condition; damage is assessed from photos taken at pickup and return.',
        ],
      },
      {
        heading: 'Penalties for sellers',
        body: [
          'Not packed within 24 hours: the order is cancelled, the customer refunded, and you get 1 strike.',
          'Wrong or damaged item: you pay the return delivery and the customer is refunded.',
          '3 strikes in 30 days: store hidden for 7 days. 5 strikes in 90 days: account review.',
          PENALTY_NOTE,
        ],
      },
      COMMON_CONDUCT,
    ],
  },
];

export const policy = (id: PolicyId) => POLICIES.find((p) => p.id === id)!;

/** Which policies each account type agrees to at sign-up. */
export function policiesFor(kind: 'customer' | 'individual' | 'team' | 'agency' | 'seller'): PolicyId[] {
  if (kind === 'customer') return ['privacy', 'customer'];
  if (kind === 'individual') return ['privacy', 'artisan'];
  if (kind === 'team') return ['privacy', 'artisan', 'team'];
  if (kind === 'agency') return ['privacy', 'artisan', 'team', 'agency'];
  return ['privacy', 'seller'];
}

export function policyMarkdown(p: Policy): string {
  return [`# ${p.title}`, '', `_Version ${POLICY_VERSION} · DRAFT for review. Items in [square brackets] need Sleek’s details; have a Nigerian lawyer review before launch._`, '', p.summary, '', ...p.sections.flatMap((s) => [`## ${s.heading}`, '', ...s.body.map((b) => `- ${b}`), ''])].join('\n');
}
