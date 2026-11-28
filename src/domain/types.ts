/**
 * Sleek core domain types.
 *
 * These types are the single source of truth for the trust rules. The mobile
 * app uses them for optimistic UI, and the backend must enforce the exact same
 * rules (see docs/BACKEND_CONTRACT.md). Amounts are whole Naira (NGN).
 */

export type ID = string;
export type ISODate = string;

export type Role = 'customer' | 'artisan' | 'seller' | 'admin';
export type ArtisanAccountType = 'individual' | 'team' | 'agency';

export type ThemeMode = 'white' | 'black' | 'blue';

// ---------------------------------------------------------------------------
// Categories / skills
// ---------------------------------------------------------------------------

export type RiskLevel = 'standard' | 'high';

/** The one upfront fee a customer pays before an artisan engages: set per trade by Sleek, changeable by the artisan. */
export type FeeType = 'booking' | 'consultancy' | 'inspection';

export interface FeeSetting {
  type: FeeType;
  amount: number;
}

export interface JobFee extends FeeSetting {
  /** unpaid → held (in Sleek Hold) → released to the artisan (minus commission), or refunded. */
  status: 'unpaid' | 'held' | 'released' | 'refunded';
  paidAt?: ISODate;
  reference?: string;
  releasedAt?: ISODate;
  commission?: number;
  toArtisan?: number;
  refundedAt?: ISODate;
}

export type AuthProvider = 'phone' | 'google' | 'apple' | 'email';

/** Someone who vouches for an artisan, team, agency or seller. They confirm by SMS code. */
export interface Guarantor {
  name: string;
  phone: string;
  relationship: string;
  occupation: string;
  status: 'pending' | 'confirmed';
  confirmedAt?: ISODate;
}

/** A policy the person agreed to, and which version. */
export interface PolicyConsent {
  policyId: string;
  version: string;
  at: ISODate;
}
export type JobSize = 'short' | 'normal' | 'large';

export interface Category {
  id: ID;
  name: string;
  group: string;
  icon: string; // Ionicons glyph name
  risk: RiskLevel;
  /** Typical job size; used for auto-release windows when nothing else applies. */
  defaultSize: JobSize;
  /** Suited to stacking many short, non-overlapping jobs in one day. */
  multiJobFriendly?: boolean;
  /** What the skill video must clearly show. */
  videoBrief: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type CheckStatus = 'not_started' | 'pending' | 'passed' | 'failed';

export interface IdentityVerification {
  nin: CheckStatus;
  ninLast4?: string; // never store the full NIN on device
  liveness: CheckStatus;
  faceMatch: CheckStatus;
  faceMatchScore?: number; // 0..1
  verifiedAt?: ISODate;
  fullNameOnRecord?: string;
  /** One-way hash of the full NIN, used only to stop one NIN opening several accounts. */
  ninHash?: string;
  /** Failed NIN / face attempts. 3 failures lock self-service verification until Trust reviews it. */
  failedAttempts?: number;
  /** Instant checks pass first; the Trust team audits afterwards and can revoke. */
  postReview?: PostReview;
}

export type PostReview = 'pending' | 'confirmed' | 'revoked';

export type SkillVerificationStatus =
  | 'not_started'
  | 'submitted' // video uploaded, automated checks running
  | 'in_review' // waiting for human review (always for high-risk skills)
  | 'approved'
  | 'rejected'
  | 'needs_more'; // reviewer requested another video

export interface SkillVideo {
  id: ID;
  uri: string;
  durationSec: number;
  recordedInApp: true;
  livenessPassed: boolean;
  faceMatchScore: number; // 0..1 vs. the identity selfie
  recordedAt: ISODate;
  /** Device integrity hash computed at capture time. */
  captureHash: string;
}

export interface SkillVerification {
  categoryId: ID;
  status: SkillVerificationStatus;
  video?: SkillVideo;
  /** Reviewer quality score 0..5 of the proof-of-work video. */
  qualityScore?: number;
  reviewerNote?: string;
  submittedAt?: ISODate;
  decidedAt?: ISODate;
  /** Extra evidence required for high-risk trades (e.g. COREN/NABTEB certificate). */
  certificateRequired?: boolean;
  certificateProvided?: boolean;
  /** Photo of the trade certificate/licence, captured in-app (high-risk trades). */
  certificate?: CapturedMedia;
  /** Approved instantly by the automated checks, then audited by the Trust team. */
  postReview?: PostReview;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Address {
  label: string;
  line1: string;
  area: string;
  city: string;
  state: string;
  landmark?: string;
}

export interface Customer {
  id: ID;
  role: 'customer';
  name: string;
  phone: string;
  area: string;
  city: string;
  addresses: Address[];
  joinedAt: ISODate;
  identity?: IdentityVerification;
  /** Saved / favourite artisans. */
  favourites?: ID[];
  prefs?: MatchingPrefs;
  /** Ratings artisans gave this customer (two-way reviews). */
  customerStats?: CustomerStats;
  /** Someone the customer can share live job details with in an emergency. */
  trustedContact?: { name: string; phone: string };
  /** Sleek credit (referral rewards), usable on Sleek Services. */
  credit?: number;
  referralCode?: string;
  email?: string;
  suspended?: boolean;
  suspendedReason?: string;
  authProvider?: AuthProvider;
  consents?: PolicyConsent[];
  phoneVerified?: boolean;
  emailVerified?: boolean;
}

export type GenderPreference = 'any' | 'female' | 'male';

export interface MatchingPrefs {
  genderPreference: GenderPreference;
  minRating: number; // 0 = any
  trustedOnly: boolean;
  maxDistanceKm: number | null;
  availableToday: boolean;
  priceMin?: number;
  priceMax?: number;
}

export interface CustomerStats {
  ratingCount: number;
  professionalismSum: number;
  claritySum: number;
  paymentSum: number;
}

export interface Worker {
  id: ID;
  name: string;
  /** Workers in teams/agencies are individually verified. */
  identity: IdentityVerification;
  skills: SkillVerification[];
  active: boolean;
  avatarColor: string;
  /** Supervisors can accept jobs and manage the shared calendar. */
  role?: 'member' | 'supervisor';
  joinedAt?: ISODate;
  /** Internal note from the owner (not shown to customers). */
  ownerNote?: string;
}

export interface TrustStats {
  completedJobs: number;
  cancelledByArtisan: number;
  disputesOpened: number;
  disputesLost: number;
  ruleViolations: number;
  lastViolationAt?: ISODate;
  ratingSum: number;
  ratingCount: number;
  onTimeRate: number; // 0..1
}

export interface Artisan {
  id: ID;
  role: 'artisan';
  accountType: ArtisanAccountType;
  businessName?: string;
  name: string;
  phone: string;
  bio: string;
  area: string;
  city: string;
  yearsExperience: number;
  /** Online/offline switch controlled by the artisan. */
  online: boolean;
  identity: IdentityVerification;
  skills: SkillVerification[];
  /** Starting prices per category (guide only — real price agreed in Price Pool). */
  startingPrices: Record<ID, number>;
  stats: TrustStats;
  /** For team/agency accounts. Individuals have a single implicit worker = themselves. */
  workers: Worker[];
  /** Team/Agency: shared calendar (all workers visible to admins) or individual. */
  calendarMode?: 'shared' | 'individual';
  /** Weekly working hours, 0 = Sunday. */
  workingHours: Record<number, { start: number; end: number } | null>;
  joinedAt: ISODate;
  avatarColor: string;
  payoutAccount?: PayoutAccount;
  payoutSchedule?: PayoutSchedule;
  gender?: 'female' | 'male';
  /** Days/periods the artisan is not taking jobs (holiday, sick, travel). */
  timeOff?: TimeOff[];
  referralCode?: string;
  /** Team/Agency business details collected in the dedicated onboarding flow. */
  business?: BusinessDetails;
  /** Verified email: used for verification results and important account notices. */
  email?: string;
  suspended?: boolean;
  suspendedReason?: string;
  /** Upfront fee per trade (type and amount), chosen by the artisan. Falls back to Sleek's default for the trade. */
  fees?: Record<ID, FeeSetting>;
  authProvider?: AuthProvider;
  guarantor?: Guarantor;
  /** Set when every onboarding check has passed; the dashboard opens only then. */
  activatedAt?: ISODate;
  consents?: PolicyConsent[];
  phoneVerified?: boolean;
  emailVerified?: boolean;
}

export interface TimeOff {
  id: ID;
  start: ISODate;
  end: ISODate;
  reason: string;
}

export interface BusinessDetails {
  cacNumber?: string; // CAC registration (asked of teams and agencies)
  /** Not registered with CAC yet: allowed, but flagged for the Trust team. */
  cacPending?: boolean;
  serviceAreas: string[];
  teamSize: number;
  completedOnboarding: boolean;
}

export interface PayoutSchedule {
  /** manual = withdraw when you want; daily/weekly = automatic sweep of the available balance. */
  mode: 'manual' | 'daily' | 'weekly';
  weekday?: number; // 0..6 for weekly
  minimum: number; // don't auto-pay below this amount
  lastAutoPayoutAt?: ISODate;
}

export interface PayoutAccount {
  bankName: string;
  accountNumberLast4: string;
  accountName: string;
  verified: boolean;
}

export interface Admin {
  id: ID;
  role: 'admin';
  name: string;
  phone: string;
}

/** Sells products or rents out equipment on Sleek Services. Verified like artisans (NIN + face). */
export interface Seller {
  id: ID;
  role: 'seller';
  name: string;
  businessName: string;
  phone: string;
  email: string;
  area: string;
  city: string;
  joinedAt: ISODate;
  identity: IdentityVerification;
  cacNumber?: string;
  /** Becomes true the moment identity verification passes. */
  storeLive: boolean;
  avatarColor: string;
  payoutAccount?: PayoutAccount;
  suspended?: boolean;
  suspendedReason?: string;
  authProvider?: AuthProvider;
  guarantor?: Guarantor;
  activatedAt?: ISODate;
  consents?: PolicyConsent[];
  /** True when the seller says they aren't registered with CAC yet (allowed, but flagged for review). */
  cacPending?: boolean;
  phoneVerified?: boolean;
  emailVerified?: boolean;
}

export type User = Customer | Artisan | Seller | Admin;

// ---------------------------------------------------------------------------
// Support, email, provider log
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'waiting_on_you' | 'resolved';
export type TicketCategory = 'payment' | 'job' | 'order' | 'account' | 'verification' | 'safety' | 'other';

export interface TicketMessage {
  id: ID;
  from: 'user' | 'agent' | 'system';
  name?: string;
  text: string;
  at: ISODate;
}

export interface SupportTicket {
  id: ID;
  userId: ID;
  userRole: 'customer' | 'artisan' | 'seller';
  subject: string;
  category: TicketCategory;
  jobId?: ID;
  orderId?: ID;
  status: TicketStatus;
  priority: 'normal' | 'high' | 'urgent';
  assignedTo?: string;
  messages: TicketMessage[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface EmailMessage {
  id: ID;
  to: string;
  userId?: ID;
  subject: string;
  body: string;
  at: ISODate;
}

export type ProviderKey = 'payments' | 'identity' | 'sms' | 'email' | 'maps' | 'storage' | 'vision';

/** A record of each call to an outside provider (simulated in demo builds). */
export interface ProviderEvent {
  id: ID;
  provider: ProviderKey;
  action: string;
  summary: string;
  ok: boolean;
  at: ISODate;
}

/** Platform settings the admin console can change. */
export interface PlatformConfig {
  commissionRate: number;
  offAppStrikesToSuspend: number;
  autoReleaseHours: { short: number; normal: number; large: number };
  protectionDays: number;
  protectionCap: number;
  deliveryFee: number;
  /** Sleek's fee type per trade, overriding the built-in default. */
  tradeFeeTypes?: Record<ID, FeeType>;
}

// ---------------------------------------------------------------------------
// Jobs, price pool, escrow
// ---------------------------------------------------------------------------

export interface TimeWindow {
  start: ISODate;
  end: ISODate;
}

export type OfferStatus = 'pending' | 'accepted' | 'superseded' | 'withdrawn';

export interface PriceOffer {
  id: ID;
  by: 'customer' | 'artisan';
  amount: number;
  note?: string;
  at: ISODate;
  status: OfferStatus;
}

export interface PricePool {
  offers: PriceOffer[];
  locked?: { amount: number; lockedAt: ISODate; offerId: ID };
}

export type JobStatus =
  | 'requested' // customer sent request, negotiating in chat
  | 'price_agreed' // price locked, waiting for customer to fund escrow
  | 'funded' // escrow funded, location disclosed, waiting for scheduled time  → "Upcoming"
  | 'in_progress' // artisan has started → "On Job"
  | 'proof_submitted' // proof of work uploaded → "Pending Approval"
  | 'completed' // money released
  | 'disputed' // → "In Dispute"
  | 'resolved' // dispute resolved by Sleek
  | 'cancelled'
  | 'declined';

export type EscrowState = 'none' | 'held' | 'released' | 'refunded' | 'partially_refunded' | 'frozen';

export interface Escrow {
  state: EscrowState;
  amount: number;
  fundedAt?: ISODate;
  paymentRef?: string;
  releasedAt?: ISODate;
  releasedToArtisan?: number;
  commission?: number;
  refundedToCustomer?: number;
  releaseReason?: 'customer_approved' | 'auto_release' | 'dispute_resolution';
}

export interface ProofOfWork {
  photos: CapturedMedia[];
  note: string;
  submittedAt: ISODate;
  autoReleaseAt: ISODate;
}

export interface CapturedMedia {
  id: ID;
  uri: string;
  purpose: UploadPurpose;
  capturedAt: ISODate;
  /** Every controlled upload is logged with who, what for, and when. */
  loggedBy: ID;
}

export type UploadPurpose =
  | 'issue_photo' // customer: "Upload photo of the issue"
  | 'site_before' // artisan: before starting
  | 'proof_of_work' // artisan: after finishing
  | 'dispute_evidence'
  | 'delivery_confirmation'
  | 'certificate';

export interface JobTimelineEvent {
  at: ISODate;
  label: string;
  by: 'customer' | 'artisan' | 'system' | 'admin' | 'ugent';
}

export interface Review {
  id: ID;
  jobId: ID;
  artisanId: ID;
  customerName: string;
  rating: number; // 1..5
  comment: string;
  categoryId: ID;
  at: ISODate;
}

export interface Job {
  id: ID;
  customerId: ID;
  artisanId: ID;
  /** For team/agency jobs: which verified worker is assigned. */
  workerId?: ID;
  categoryId: ID;
  title: string;
  description: string;
  window: TimeWindow;
  /** Disclosed to the artisan ONLY when escrow is held. */
  address: Address;
  size: JobSize;
  status: JobStatus;
  pricePool: PricePool;
  escrow: Escrow;
  issuePhotos: CapturedMedia[];
  proof?: ProofOfWork;
  disputeId?: ID;
  reviewId?: ID;
  cancellation?: CancellationRecord;
  createdAt: ISODate;
  updatedAt: ISODate;
  timeline: JobTimelineEvent[];
  /** Set when the booking was initiated by Ugent on the user's behalf. */
  origin: 'app' | 'ugent' | 'match';
  /** Upfront booking / consultancy / inspection fee for this job. */
  fee?: JobFee;
  inspectedAt?: ISODate;
  /** Artisan tapped "I'm on my way". */
  enRouteAt?: ISODate;
  startedAt?: ISODate;
  extensions?: ExtensionRequest[];
  tip?: { amount: number; at: ISODate; reference: string };
  /** The artisan's rating of the customer (two-way reviews). */
  customerReviewId?: ID;
  safetyAlertIds?: ID[];
  guaranteeClaimId?: ID;
}

export interface ExtensionRequest {
  id: ID;
  extraMinutes: number;
  newEnd: ISODate;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  at: ISODate;
  decidedAt?: ISODate;
}

export interface CustomerReview {
  id: ID;
  jobId: ID;
  customerId: ID;
  artisanId: ID;
  professionalism: number; // 1..5
  clarity: number; // 1..5 — was the job described clearly?
  payment: number; // 1..5 — paid promptly, approved fairly
  comment: string;
  at: ISODate;
}

export type SafetyAlertKind = 'sos' | 'unsafe' | 'emergency_call' | 'shared_with_contact';

export interface SafetyAlert {
  id: ID;
  userId: ID;
  role: 'customer' | 'artisan';
  jobId?: ID;
  kind: SafetyAlertKind;
  note: string;
  at: ISODate;
  status: 'open' | 'acknowledged' | 'resolved';
  handledBy?: ID;
  handledAt?: ISODate;
}

export interface GuaranteeClaim {
  id: ID;
  jobId: ID;
  customerId: ID;
  details: string;
  evidence: CapturedMedia[];
  status: 'submitted' | 'approved' | 'declined';
  at: ISODate;
  payout?: number;
}

export interface Referral {
  id: ID;
  code: string;
  referrerId: ID;
  refereeId: ID;
  refereeName: string;
  refereeRole: 'customer' | 'artisan';
  status: 'pending' | 'qualified';
  reward: number;
  at: ISODate;
  qualifiedAt?: ISODate;
}

export interface AdminNote {
  id: ID;
  targetType: 'user' | 'job' | 'dispute' | 'safety';
  targetId: ID;
  by: ID;
  text: string;
  at: ISODate;
}

export type NotificationCategory =
  | 'job_requests'
  | 'price_offers'
  | 'escrow'
  | 'job_progress'
  | 'proof'
  | 'payments'
  | 'disputes'
  | 'safety'
  | 'reviews'
  | 'verification'
  | 'orders'
  | 'referrals'
  | 'promotions'
  | 'system';

export interface NotificationPrefs {
  enabled: Partial<Record<NotificationCategory, boolean>>;
  quietHours: { enabled: boolean; start: number; end: number };
}

export interface CancellationRecord {
  by: 'customer' | 'artisan' | 'admin';
  reason: string;
  at: ISODate;
  refundAmount: number;
  artisanCompensation: number;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type MessageKind = 'text' | 'system' | 'price' | 'media';

export interface ChatMessage {
  id: ID;
  jobId: ID;
  from: 'customer' | 'artisan' | 'system';
  kind: MessageKind;
  text: string;
  at: ISODate;
  media?: CapturedMedia;
  offerId?: ID;
}

export type ViolationType = 'phone_number' | 'email' | 'off_app' | 'link' | 'off_app_payment';

export interface RuleViolation {
  id: ID;
  userId: ID;
  role: 'customer' | 'artisan';
  jobId: ID;
  types: ViolationType[];
  /** Redacted excerpt kept for admin review. */
  excerpt: string;
  at: ISODate;
  reviewed: boolean;
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export type DisputeReason =
  | 'not_completed'
  | 'poor_quality'
  | 'no_show'
  | 'damage'
  | 'overcharge_request'
  | 'other';

export type DisputeStatus = 'open' | 'under_review' | 'resolved';
export type DisputeOutcome = 'release_to_artisan' | 'refund_customer' | 'split';

export interface Dispute {
  id: ID;
  jobId: ID;
  openedBy: 'customer' | 'artisan';
  reason: DisputeReason;
  details: string;
  evidence: CapturedMedia[];
  status: DisputeStatus;
  openedAt: ISODate;
  artisanResponse?: string;
  resolution?: {
    outcome: DisputeOutcome;
    artisanShare: number; // 0..1 of escrow amount (before commission)
    note: string;
    by: ID;
    at: ISODate;
  };
}

// ---------------------------------------------------------------------------
// Sleek Services (shop & rentals)
// ---------------------------------------------------------------------------

export type ServiceItemKind = 'product' | 'rental';

export interface ServiceItem {
  id: ID;
  kind: ServiceItemKind;
  name: string;
  group: string;
  icon: string;
  price: number; // product: per unit, rental: per day
  listPrice?: number; // to show discount
  unit: string;
  description: string;
  vendor: string;
  vendorArea: string;
  stock: number;
  /** The Sleek Services seller who listed it (seed items belong to demo sellers). */
  sellerId?: ID;
  /** live = visible in the shop; unlisted = hidden by the seller or by Sleek. */
  status?: 'live' | 'unlisted';
  deposit?: number; // rentals: refundable deposit
  relatedCategoryIds: ID[];
}

export interface CartLine {
  itemId: ID;
  qty: number;
  rentalDays?: number;
  rentalStart?: ISODate;
}

export type DeliveryTarget = 'customer' | 'artisan';
export type OrderStatus = 'placed' | 'confirmed' | 'dispatched' | 'delivered' | 'returned' | 'cancelled';

export interface Order {
  id: ID;
  userId: ID;
  lines: CartLine[];
  subtotal: number;
  deposit: number;
  deliveryFee: number;
  total: number;
  deliverTo: DeliveryTarget;
  deliveryAddress: string;
  /** If linked to a booked job (materials for that job). */
  jobId?: ID;
  status: OrderStatus;
  placedAt: ISODate;
  timeline: { at: ISODate; label: string }[];
  eta?: ISODate;
  /** The Sleek rider delivering it. Their number is shown only after payment. */
  rider?: Rider;
}

export interface Rider {
  id: ID;
  name: string;
  phone: string;
  bike: string;
  plate: string;
  rating: number;
}

// ---------------------------------------------------------------------------
// Notifications / payouts
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: ID;
  userId: ID;
  title: string;
  body: string;
  at: ISODate;
  read: boolean;
  link?: string;
  category?: NotificationCategory;
  /** Delivered to the inbox only (muted by the user's preferences or quiet hours). */
  silent?: boolean;
}

export interface Payout {
  id: ID;
  artisanId: ID;
  amount: number;
  status: 'processing' | 'paid' | 'failed';
  requestedAt: ISODate;
  paidAt?: ISODate;
}

export interface LedgerEntry {
  id: ID;
  artisanId: ID;
  jobId?: ID;
  type: 'escrow_release' | 'payout' | 'cancellation_fee' | 'tip' | 'referral_bonus' | 'payout_reversal' | 'fee_release';
  amount: number; // positive credit, negative debit
  at: ISODate;
  note: string;
}
