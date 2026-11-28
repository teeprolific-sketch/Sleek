import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { category, categoryName } from '../data/categories';
import {
  DEMO_ADMIN_ID,
  DEMO_ARTISAN_ID,
  DEMO_CUSTOMER_ID,
  DEMO_SELLER_ID,
  RIDERS,
  SEED_ADMIN,
  seedProducts,
  seedSellers,
  seedArtisans,
  seedCustomers,
  seedJobs,
  seedCustomerReviews,
  seedDisputes,
  seedReviews,
} from '../data/seed';
import { validateCustomerReview } from '../domain/customerRating';
import { extensionClashes, pendingExtension, validateExtension } from '../domain/extensions';
import { DEFAULT_PREFS } from '../domain/matching';
import { categoryFromLink, DEFAULT_NOTIFICATION_PREFS, shouldPush } from '../domain/notifications';
import { autoPayoutDue, DEFAULT_SCHEDULE } from '../domain/payouts';
import { protectionCover, protectionEligible, protectionWindow } from '../domain/protection';
import { makeReferralCode, referralQualifies, REFERRAL_REWARD } from '../domain/referrals';
import { canMarkEnRoute } from '../domain/timeline';
import { validateTip } from '../domain/tips';
import { bookableFor, freeWorkersFor, workerFreeFor, workerSkillApproved } from '../domain/availability';
import * as Esc from '../domain/escrow';
import { moderateMessage, type ModerationResult } from '../domain/moderation';
import * as Pool from '../domain/pricePool';
import { isTrusted } from '../domain/trust';
import type {
  Admin,
  AdminNote,
  AppNotification,
  BusinessDetails,
  CustomerReview,
  GuaranteeClaim,
  MatchingPrefs,
  NotificationCategory,
  NotificationPrefs,
  PayoutSchedule,
  Referral,
  SafetyAlert,
  SafetyAlertKind,
  TimeOff,
  Worker as WorkerT,
  Artisan,
  ArtisanAccountType,
  CapturedMedia,
  CartLine,
  ChatMessage,
  Customer,
  DeliveryTarget,
  Dispute,
  DisputeReason,
  ID,
  Job,
  LedgerEntry,
  Order,
  Payout,
  PayoutAccount,
  Review,
  Role,
  RuleViolation,
  SkillVerification,
  ThemeMode,
  TimeWindow,
  UploadPurpose,
  User,
  Worker,
  EmailMessage,
  PlatformConfig,
  ProviderEvent,
  ProviderKey,
  Seller,
  ServiceItem,
  SupportTicket,
  TicketCategory,
  IdentityVerification,
  FeeSetting,
  AuthProvider,
  PolicyConsent,
} from '../domain/types';
import { allDone, artisanSteps, sellerSteps } from '../domain/activation';
import { feeEditable, feeExpired, feeFor, FEE_LABEL, feePaid, feeSplit, releasesOn, validateFee } from '../domain/fees';
import { checkSkillVideo, emptyIdentity, hashNIN, MAX_VERIFICATION_FAILURES, namesMatch, statusAfterAutoCheck } from '../domain/verification';
import { demoCode, providerInfo } from '../services/providers';
import { captureHash, identity as identityProvider } from '../services/identity';
import { payments, type PaymentMethod } from '../services/payments';
import type { UgentActionName, UgentRequest } from '../ugent/types';
import { naira, uid } from '../utils/format';

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export interface Session {
  userId?: ID;
  role?: Role;
  phone?: string;
  /** Opaque token; production stores it in expo-secure-store. */
  token?: string;
}

export interface Settings {
  themeMode: ThemeMode;
  notifications: boolean;
  dataSaver: boolean;
  ugentLinked: boolean;
  language: 'en' | 'pcm';
  /** First-run tooltips already dismissed. */
  seenTips: string[];
  /** Demo/QA: force the offline experience regardless of the real connection. */
  simulateOffline?: boolean;
}

export interface OutboxMessage {
  id: ID;
  jobId: ID;
  from: 'customer' | 'artisan';
  text: string;
  at: string;
}

interface Data {
  onboarded: boolean;
  session: Session;
  settings: Settings;
  customers: Customer[];
  artisans: Artisan[];
  admins: Admin[];
  jobs: Job[];
  messages: ChatMessage[];
  reviews: Review[];
  disputes: Dispute[];
  violations: RuleViolation[];
  notifications: AppNotification[];
  cart: CartLine[];
  orders: Order[];
  ledger: LedgerEntry[];
  payouts: Payout[];
  ugentRequests: UgentRequest[];
  /** Audit log of every controlled upload. */
  uploadLog: CapturedMedia[];
  customerReviews: CustomerReview[];
  safetyAlerts: SafetyAlert[];
  guaranteeClaims: GuaranteeClaim[];
  referrals: Referral[];
  adminNotes: AdminNote[];
  notificationPrefs: Record<ID, NotificationPrefs>;
  /** Chat messages written while offline; sent automatically when the network returns. */
  outbox: OutboxMessage[];
  network: { online: boolean; weak: boolean };
  sellers: Seller[];
  /** Sleek Services catalogue (seller listings). */
  products: ServiceItem[];
  tickets: SupportTicket[];
  /** Simulated email outbox (Resend in production). */
  emails: EmailMessage[];
  /** Every simulated provider call, newest first. */
  providerLog: ProviderEvent[];
  platformConfig: PlatformConfig;
}

export const DEFAULT_CONFIG: PlatformConfig = {
  commissionRate: Esc.COMMISSION_RATE,
  offAppStrikesToSuspend: 5,
  autoReleaseHours: { ...Esc.AUTO_RELEASE_HOURS },
  protectionDays: 7,
  protectionCap: 50_000,
  deliveryFee: 2500,
};

/** Who is acting in the admin console. Never persisted and never set by the mobile app. */
export interface AdminActor {
  id: string;
  name: string;
  role: string;
}
let adminActor: AdminActor | null = null;
export function setAdminActor(a: AdminActor | null) {
  adminActor = a;
}

export interface NewJobInput {
  artisanId: ID;
  categoryId: ID;
  title: string;
  description: string;
  window: TimeWindow;
  addressIndex: number;
  issuePhotos: CapturedMedia[];
  origin?: 'app' | 'ugent' | 'match';
  workerId?: ID;
}

export interface Actions {
  completeOnboarding(): void;
  signInDemo(kind: 'customer' | 'artisan' | 'team' | 'agency' | 'seller'): void;
  register(input: { phone: string; name: string; role: 'customer' | 'artisan' | 'seller'; accountType?: ArtisanAccountType; businessName?: string; email?: string; city: string; area: string; referralCode?: string; authProvider?: AuthProvider; consents?: PolicyConsent[] }): Result;
  /** Guarantor for professional accounts; they confirm with an SMS code. Returns the (simulated) code sent to them. */
  setGuarantor(g: { name: string; phone: string; relationship: string; occupation: string }): Result<string>;
  confirmGuarantor(code: string): Result;
  /** CAC details for teams, agencies and sellers. `notRegistered` is allowed but flagged for review. */
  setBusinessRegistration(i: { cacNumber?: string; notRegistered: boolean; serviceAreas?: string[]; teamSize?: number }): Result;
  /** Opens the account once every verification step has passed. */
  activateAccount(): Result;
  /** Sends a simulated sign-in code by SMS (Termii) and returns it for the demo. */
  sendSignInCode(phone: string): string;
  /** Sends a simulated email code (Resend) and returns it for the demo. */
  sendEmailCode(email: string): string;
  signOut(): void;
  setTheme(mode: ThemeMode): void;
  updateSettings(p: Partial<Settings>): void;
  resetDemo(): void;

  // Jobs & chat
  createJob(input: NewJobInput): Result<ID>;
  sendMessage(jobId: ID, text: string): ModerationResult;
  proposePrice(jobId: ID, amount: number, note?: string): Result;
  acceptPrice(jobId: ID): Result;
  withdrawOffer(jobId: ID): Result;
  declineJob(jobId: ID, reason: string): Result;
  fundEscrow(jobId: ID, method: PaymentMethod): Promise<Result<string>>;
  assignWorker(jobId: ID, workerId: ID): Result;
  startJob(jobId: ID): Result;
  logCapture(purpose: UploadPurpose, uri: string, jobId?: ID): CapturedMedia;
  addIssuePhoto(jobId: ID, media: CapturedMedia): Result;
  submitProof(jobId: ID, photos: CapturedMedia[], note: string): Result;
  approveJob(jobId: ID): Result;
  cancelJob(jobId: ID, reason: string): Result;
  submitReview(jobId: ID, rating: number, comment: string): Result;
  openDispute(jobId: ID, reason: DisputeReason, details: string, evidence: CapturedMedia[]): Result<ID>;
  respondDispute(disputeId: ID, text: string): Result;
  tick(now?: number): void;

  // Artisan
  setOnline(online: boolean): Result;
  setWorkingHours(day: number, hours: { start: number; end: number } | null): void;
  updateArtisanProfile(p: Partial<Pick<Artisan, 'bio' | 'area' | 'city' | 'yearsExperience' | 'businessName' | 'startingPrices' | 'calendarMode'>>): void;
  verifyNIN(nin: string, name: string, workerId?: ID): Promise<Result>;
  completeLiveness(frames: string[], challenges: string[], workerId?: ID): Promise<Result>;
  submitSkillVideo(input: { categoryId: ID; uri: string; durationSec: number; workerId?: ID }): Promise<Result<SkillVerification['status']>>;
  addWorker(name: string): Result<ID>;
  setWorkerActive(workerId: ID, active: boolean): void;
  setPayoutAccount(acct: PayoutAccount): void;
  requestPayout(amount: number): Promise<Result>;

  // Admin
  reviewSkill(input: { artisanId: ID; workerId?: ID; categoryId: ID; decision: 'approved' | 'rejected' | 'needs_more'; quality?: number; note: string }): Result;
  startDisputeReview(disputeId: ID): void;
  resolveDispute(disputeId: ID, outcome: 'release_to_artisan' | 'refund_customer' | 'split', artisanShare: number, note: string): Result;
  markViolationReviewed(id: ID): void;

  // Services
  addToCart(line: CartLine): void;
  updateCartLine(itemId: ID, p: Partial<CartLine>): void;
  removeFromCart(itemId: ID): void;
  placeOrder(input: { deliverTo: DeliveryTarget; jobId?: ID; address: string; method: PaymentMethod }): Promise<Result<ID>>;

  // Notifications
  markRead(id: ID): void;
  markAllRead(): void;

  // Customer extras
  toggleFavourite(artisanId: ID): boolean;
  setMatchingPrefs(p: Partial<MatchingPrefs>): void;
  setTrustedContact(c: { name: string; phone: string } | undefined): Result;
  addTip(jobId: ID, amount: number, method: PaymentMethod): Promise<Result>;
  decideExtension(jobId: ID, approve: boolean): Result;
  submitGuaranteeClaim(jobId: ID, details: string, evidence: CapturedMedia[]): Result<ID>;
  addDisputeEvidence(disputeId: ID, media: CapturedMedia): Result;

  // Artisan extras
  markEnRoute(jobId: ID): Result;
  requestExtension(jobId: ID, extraMinutes: number, reason: string): Result;
  rateCustomer(jobId: ID, r: { professionalism: number; clarity: number; payment: number; comment: string }): Result;
  setPayoutSchedule(s: PayoutSchedule): void;
  addTimeOff(t: Omit<TimeOff, 'id'>): Result;
  removeTimeOff(id: ID): void;
  updateWorker(workerId: ID, p: Partial<Pick<WorkerT, 'role' | 'ownerNote'>>): void;
  removeWorker(workerId: ID): Result;
  completeBusinessOnboarding(d: BusinessDetails): Result;
  submitCertificate(categoryId: ID, media: CapturedMedia, workerId?: ID): Result;

  // Shared
  raiseSafetyAlert(kind: SafetyAlertKind, note: string, jobId?: ID): SafetyAlert;
  setNotificationPref(category: NotificationCategory, enabled: boolean): void;
  setQuietHours(q: NotificationPrefs['quietHours']): void;
  setLanguage(l: Settings['language']): void;
  dismissTip(id: string): void;
  setNetwork(n: { online: boolean; weak: boolean }): void;
  /** The sender's last few chat texts in a job (last 15 min), used to catch numbers split across messages. */
  recentTextsBy(jobId: ID, from: 'customer' | 'artisan'): string[];
  flushOutbox(): void;

  // Admin extras
  updateSafetyAlert(id: ID, status: SafetyAlert['status']): void;
  addAdminNote(targetType: AdminNote['targetType'], targetId: ID, text: string): Result;
  decideGuaranteeClaim(id: ID, approve: boolean, payout: number): Result;

  // Upfront fees (booking / consultancy / inspection)
  setArtisanFee(categoryId: ID, fee: FeeSetting): Result;
  setJobFee(jobId: ID, fee: FeeSetting): Result;
  payFee(jobId: ID, method: PaymentMethod): Promise<Result>;
  markInspected(jobId: ID): Result;

  // Customer verification (simple: NIN with matching name)
  verifyCustomer(nin: string, name: string): Promise<Result>;

  // Support (in-app help desk)
  openTicket(input: { subject: string; category: TicketCategory; text: string; jobId?: ID; orderId?: ID }): Result<ID>;
  replyTicket(ticketId: ID, text: string): Result;
  closeTicket(ticketId: ID): Result;

  // Sleek Services sellers
  addProduct(p: Pick<ServiceItem, 'kind' | 'name' | 'group' | 'price' | 'unit' | 'description' | 'stock'> & { deposit?: number }): Result<ID>;
  updateProduct(id: ID, p: Partial<Pick<ServiceItem, 'price' | 'stock' | 'status' | 'description'>>): Result;
  sellerConfirmOrder(orderId: ID): Result;
  setSellerPayoutAccount(acct: PayoutAccount): void;

  // Providers
  logProvider(provider: ProviderKey, action: string, summary: string, ok?: boolean): void;

  // Admin console (actor set with setAdminActor; refused otherwise)
  adminSetSuspended(userId: ID, suspended: boolean, reason: string): Result;
  adminSetIdentityReview(userId: ID, review: 'confirmed' | 'revoked' | 'pending', reason: string, workerId?: ID): Result;
  adminSetSkillReview(artisanId: ID, categoryId: ID, review: 'confirmed' | 'revoked' | 'pending', reason: string, workerId?: ID): Result;
  adminSetProductStatus(productId: ID, status: 'live' | 'unlisted', reason: string): Result;
  adminReplyTicket(ticketId: ID, text: string): Result;
  adminSetTicketStatus(ticketId: ID, status: SupportTicket['status']): Result;
  adminSetConfig(p: Partial<PlatformConfig>): Result;
  adminRefundJob(jobId: ID, reason: string): Result;
  adminSetOrderStatus(orderId: ID, status: Order['status'], reason: string): Result;

  // Ugent
  queueUgentRequest(action: UgentActionName, args: Record<string, unknown>, summary: string): UgentRequest;
  decideUgentRequest(id: ID, decision: 'confirmed' | 'rejected', result?: unknown, error?: string): void;
}

export type State = Data & Actions & { hydrated: boolean };

const nowIso = () => new Date().toISOString();

/** Recently verified artisans the Trust team hasn't audited yet (instant verification, reviewed afterwards). */
function withAuditQueue(list: Artisan[]): Artisan[] {
  const fresh: Record<string, string> = { art_kelechi: 'kelechi.eze@example.com', art_femi: 'femi.ogunleye@example.com', art_sola: 'sola.akinwale@example.com' };
  return list.map((a) =>
    fresh[a.id]
      ? { ...a, email: fresh[a.id], identity: { ...a.identity, postReview: a.id === 'art_sola' ? 'confirmed' : 'pending' }, skills: a.skills.map((k, i) => (k.status === 'approved' && (i === 0 || a.id === 'art_femi') ? { ...k, postReview: 'pending' as const, decidedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString() } : k)) }
      : a,
  );
}

/** Seeded professionals already passed every onboarding check (guarantor included). */
function withOnboarding<T extends Artisan | Seller>(list: T[]): T[] {
  return list.map((u) => (u.identity.faceMatch === 'passed' ? { ...u, activatedAt: u.joinedAt, phoneVerified: true, emailVerified: true, guarantor: { name: 'Adebayo Ogunleye', phone: `+23481${u.id.length}0000${String(u.joinedAt.length).padStart(3, '0')}`, relationship: 'Former employer', occupation: 'Trade association chairman', status: 'confirmed' as const, confirmedAt: u.joinedAt } } : u));
}

function initialData(): Data {
  const artisans = withOnboarding(withAuditQueue(seedArtisans()));
  const customers = seedCustomers();
  const { jobs, messages } = seedJobs(customers[0]);
  return {
    onboarded: false,
    session: {},
    settings: { themeMode: 'white', notifications: true, dataSaver: false, ugentLinked: false, language: 'en', seenTips: [] },
    customers,
    artisans,
    admins: [SEED_ADMIN],
    jobs,
    messages,
    reviews: seedReviews(artisans),
    disputes: seedDisputes(),
    violations: [
      { id: 'vio_demo1', userId: 'art_sola', role: 'artisan', jobId: 'job_demo_ac', types: ['phone_number'], excerpt: 'call me on 0 8 0 [number removed]', at: new Date(Date.now() - 2 * 3_600_000).toISOString(), reviewed: false },
      { id: 'vio_demo2', userId: DEMO_CUSTOMER_ID, role: 'customer', jobId: 'job_demo_ac', types: ['off_app_payment'], excerpt: 'can I just [payment request removed] directly', at: new Date(Date.now() - 26 * 3_600_000).toISOString(), reviewed: false },
    ],
    notifications: [
      { id: 'n_welcome', userId: DEMO_CUSTOMER_ID, title: 'Welcome to Sleek', body: 'Your money is protected by Sleek Hold until you approve the work.', at: nowIso(), read: false },
      { id: 'n_offer', userId: DEMO_CUSTOMER_ID, title: 'New price offer', body: 'Femi proposed ₦18,000 for “AC not cooling”.', at: nowIso(), read: false, link: '/chat/job_demo_ac' },
      { id: 'n_art', userId: 'art_femi', title: 'New job request', body: 'Amaka Johnson needs AC Repair & Install.', at: nowIso(), read: false, link: '/chat/job_demo_ac' },
    ],
    cart: [],
    orders: seedOrders(),
    ledger: [
      { id: 'l1', artisanId: DEMO_ARTISAN_ID, type: 'escrow_release', amount: 16200, at: new Date(Date.now() - 3 * 86_400_000).toISOString(), note: 'Brake pad replacement' },
      { id: 'l2', artisanId: DEMO_ARTISAN_ID, type: 'escrow_release', amount: 27000, at: new Date(Date.now() - 6 * 86_400_000).toISOString(), note: 'Engine diagnosis & plugs' },
      { id: 'l3', artisanId: DEMO_ARTISAN_ID, type: 'payout', amount: -20000, at: new Date(Date.now() - 5 * 86_400_000).toISOString(), note: 'Payout to GTBank ••4417' },
    ],
    payouts: [{ id: 'po1', artisanId: DEMO_ARTISAN_ID, amount: 20000, status: 'paid', requestedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), paidAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }],
    ugentRequests: [],
    uploadLog: [],
    customerReviews: seedCustomerReviews(),
    safetyAlerts: [{ id: 'sos_demo1', userId: 'cus_ngozi', role: 'customer', kind: 'unsafe', note: 'Artisan arrived with a second person I did not expect.', at: new Date(Date.now() - 40 * 60_000).toISOString(), status: 'open' }],
    guaranteeClaims: [],
    referrals: [
      { id: 'ref_demo1', code: makeReferralCode('Amaka Johnson', DEMO_CUSTOMER_ID), referrerId: DEMO_CUSTOMER_ID, refereeId: 'cus_demo_friend', refereeName: 'Tolu A.', refereeRole: 'customer', status: 'qualified', reward: REFERRAL_REWARD.customer, at: new Date(Date.now() - 20 * 86_400_000).toISOString(), qualifiedAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
      { id: 'ref_demo2', code: makeReferralCode('Amaka Johnson', DEMO_CUSTOMER_ID), referrerId: DEMO_CUSTOMER_ID, refereeId: 'art_demo_friend', refereeName: 'Segun O.', refereeRole: 'artisan', status: 'pending', reward: REFERRAL_REWARD.artisan, at: new Date(Date.now() - 4 * 86_400_000).toISOString() },
    ],
    adminNotes: [],
    notificationPrefs: {},
    outbox: [],
    network: { online: true, weak: false },
    sellers: withOnboarding(seedSellers()),
    products: seedProducts(),
    tickets: seedTickets(),
    emails: [],
    providerLog: [],
    platformConfig: { ...DEFAULT_CONFIG },
  };
}

function seedOrders(): Order[] {
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return [
    {
      id: 'ord_demo_brakes',
      userId: DEMO_CUSTOMER_ID,
      lines: [{ itemId: 'p_brake_pads', qty: 1 }],
      subtotal: 16000,
      deposit: 0,
      deliveryFee: 2500,
      total: 18500,
      deliverTo: 'customer',
      deliveryAddress: '12 Herbert Macaulay Way, Yaba',
      status: 'placed',
      placedAt: ago(1),
      timeline: [{ at: ago(1), label: 'Order placed and paid' }],
      eta: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      rider: RIDERS[0],
    },
    {
      id: 'ord_demo_toolbox',
      userId: 'cus_tobi',
      lines: [{ itemId: 'p_toolbox', qty: 1 }],
      subtotal: 42000,
      deposit: 0,
      deliveryFee: 2500,
      total: 44500,
      deliverTo: 'customer',
      deliveryAddress: 'Surulere, Lagos',
      status: 'delivered',
      placedAt: ago(3 * 24 * 60),
      timeline: [{ at: ago(3 * 24 * 60), label: 'Order placed and paid' }, { at: ago(3 * 24 * 60 - 90), label: 'Delivered' }],
      rider: RIDERS[1],
    },
  ];
}

function seedTickets(): SupportTicket[] {
  const t = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  return [
    {
      id: 'tk_demo1',
      userId: DEMO_CUSTOMER_ID,
      userRole: 'customer',
      subject: 'How long does a refund take?',
      category: 'payment',
      status: 'resolved',
      priority: 'normal',
      assignedTo: 'Sleek Support',
      messages: [
        { id: 'tm1', from: 'user', text: 'My job was cancelled yesterday. When will I get my money back?', at: t(30) },
        { id: 'tm2', from: 'agent', name: 'Zainab (Sleek Support)', text: 'Hi Amaka, refunds go back to your original payment method within 24 hours. Yours was sent this morning.', at: t(29) },
      ],
      createdAt: t(30),
      updatedAt: t(29),
    },
    {
      id: 'tk_demo2',
      userId: DEMO_ARTISAN_ID,
      userRole: 'artisan',
      subject: 'Change my payout bank',
      category: 'account',
      status: 'open',
      priority: 'normal',
      messages: [{ id: 'tm3', from: 'user', text: 'I want to move my payouts from GTBank to Opay. What do I need to do?', at: t(3) }],
      createdAt: t(3),
      updatedAt: t(3),
    },
  ];
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      // ---- helpers ---------------------------------------------------------
      const me = () => get().session;
      const job = (id: ID) => get().jobs.find((j) => j.id === id);
      const artisanById = (id: ID) => get().artisans.find((a) => a.id === id);
      const myParty = (j: Job): 'customer' | 'artisan' | null => {
        const s = me();
        if (s.userId === j.customerId) return 'customer';
        if (s.userId === j.artisanId) return 'artisan';
        return null;
      };
      const patchJob = (id: ID, fn: (j: Job) => Partial<Job>) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...fn(j), updatedAt: nowIso() } : j)) }));
      const patchArtisan = (id: ID, fn: (a: Artisan) => Partial<Artisan>) =>
        set((s) => ({ artisans: s.artisans.map((a) => (a.id === id ? { ...a, ...fn(a) } : a)) }));
      const timeline = (j: Job, label: string, by: Job['timeline'][number]['by']) => [...j.timeline, { at: nowIso(), label, by }];
      const sys = (jobId: ID, text: string, extra: Partial<ChatMessage> = {}) =>
        set((s) => ({ messages: [...s.messages, { id: uid('msg'), jobId, from: 'system', kind: 'system', text, at: nowIso(), ...extra }] }));
      const notify = (userId: ID, title: string, body: string, link?: string, category?: NotificationCategory) =>
        set((s) => {
          const cat = category ?? categoryFromLink(link, title);
          const silent = !shouldPush(s.notificationPrefs[userId], cat, Date.now());
          // Production: when !silent, also send an Expo push to the user's devices.
          return { notifications: [{ id: uid('n'), userId, title, body, at: nowIso(), read: false, link, category: cat, silent }, ...s.notifications] };
        });
      const adminIds = () => get().admins.map((a) => a.id);
      const sellerById = (id: ID) => get().sellers.find((x) => x.id === id);
      const logProvider = (provider: ProviderKey, action: string, summary: string, okFlag = true) =>
        set((s) => ({ providerLog: [{ id: uid('pv'), provider, action, summary, ok: okFlag, at: nowIso() }, ...s.providerLog].slice(0, 300) }));
      const sendEmail = (to: string | undefined, subject: string, body: string, userId?: ID) => {
        if (!to) return;
        set((s) => ({ emails: [{ id: uid('em'), to, userId, subject, body, at: nowIso() }, ...s.emails].slice(0, 200) }));
        logProvider('email', 'send', `${providerInfo('email').name}: “${subject}” to ${to}`);
      };
      const rate = () => get().platformConfig?.commissionRate ?? Esc.COMMISSION_RATE;
      const isSuspended = (id?: ID) => !!id && !!(get().customers.find((c) => c.id === id)?.suspended || artisanById(id)?.suspended || sellerById(id)?.suspended);
      const SUSPENDED = 'Your account is suspended. Open Help to talk to Sleek Support.';
      const requireAdmin = (): Result<AdminActor> => (adminActor ? ok(adminActor) : fail('Only Sleek staff can do this, from the admin console.'));
      /** Identity of whoever is verifying: the artisan, one of their workers, or a seller. */
      const identityOwner = (workerId?: ID): { kind: 'artisan' | 'worker' | 'seller'; name: string; identity: IdentityVerification; email?: string } | null => {
        const id = me().userId;
        if (!id) return null;
        const sel = sellerById(id);
        if (sel) return { kind: 'seller', name: sel.name, identity: sel.identity, email: sel.email };
        const a = artisanById(id);
        if (!a) return null;
        if (workerId) {
          const w = a.workers.find((x) => x.id === workerId);
          return w ? { kind: 'worker', name: w.name, identity: w.identity, email: a.email } : null;
        }
        return { kind: 'artisan', name: a.name, identity: a.identity, email: a.email };
      };
      const patchIdentity = (workerId: ID | undefined, fn: (i: IdentityVerification) => IdentityVerification) => {
        const id = me().userId!;
        if (sellerById(id)) return set((s) => ({ sellers: s.sellers.map((x) => (x.id === id ? { ...x, identity: fn(x.identity) } : x)) }));
        if (workerId) patchArtisan(id, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, identity: fn(w.identity) } : w)) }));
        else patchArtisan(id, (a) => ({ identity: fn(a.identity) }));
      };
      const allIdentities = () => [
        ...get().artisans.flatMap((a) => [{ owner: a.id, identity: a.identity }, ...a.workers.map((w) => ({ owner: `${a.id}/${w.id}`, identity: w.identity }))]),
        ...get().sellers.map((x) => ({ owner: x.id, identity: x.identity })),
      ];
      const isOffline = () => !get().network.online;
      const OFFLINE = 'You’re offline. Connect to the internet to do this — nothing has been charged.';
      const OFFLINE_ACTION = 'You’re offline. This needs a connection — try again when you’re back online.';
      const referralCodeOf = (id: ID, name: string) => makeReferralCode(name, id);
      /** Check whether this user's referral now qualifies, and reward the referrer once. */
      const checkReferral = (refereeId: ID, role: 'customer' | 'artisan', completedJobs: number) => {
        const r = get().referrals.find((x) => x.refereeId === refereeId && x.status === 'pending');
        if (!r || !referralQualifies(role, completedJobs)) return;
        set((s) => ({ referrals: s.referrals.map((x) => (x.id === r.id ? { ...x, status: 'qualified', qualifiedAt: nowIso() } : x)) }));
        if (artisanById(r.referrerId)) {
          set((s) => ({ ledger: [{ id: uid('led'), artisanId: r.referrerId, type: 'referral_bonus', amount: r.reward, at: nowIso(), note: `Referral bonus: ${r.refereeName}` }, ...s.ledger] }));
        } else {
          set((s) => ({ customers: s.customers.map((c) => (c.id === r.referrerId ? { ...c, credit: (c.credit ?? 0) + r.reward } : c)) }));
        }
        notify(r.referrerId, 'You earned a referral reward', `${r.refereeName} qualified — ${naira(r.reward)} added${artisanById(r.referrerId) ? ' to your earnings' : ' as Sleek credit'}.`, '/referrals', 'referrals');
      };
      const nameOf = (id: ID) => get().customers.find((c) => c.id === id)?.name ?? artisanById(id)?.businessName ?? artisanById(id)?.name ?? 'User';

      const releaseToArtisan = (j: Job, reason: 'customer_approved' | 'auto_release') => {
        const a = artisanById(j.artisanId)!;
        const escrow = Esc.release(j.escrow, isTrusted(a, Date.now()), reason, nowIso(), rate());
        patchJob(j.id, (x) => ({
          status: 'completed',
          escrow,
          timeline: timeline(x, reason === 'auto_release' ? 'No response from customer — payment auto-released' : 'Customer approved — payment released', 'system'),
        }));
        set((s) => ({
          ledger: [{ id: uid('led'), artisanId: a.id, jobId: j.id, type: 'escrow_release', amount: escrow.releasedToArtisan!, at: nowIso(), note: j.title }, ...s.ledger],
        }));
        patchArtisan(a.id, (x) => ({ stats: { ...x.stats, completedJobs: x.stats.completedJobs + 1 } }));
        checkReferral(a.id, 'artisan', a.stats.completedJobs + 1);
        checkReferral(j.customerId, 'customer', get().jobs.filter((x) => x.customerId === j.customerId && x.status === 'completed').length);
        sys(j.id, `Payment released: ${naira(escrow.releasedToArtisan!)} to the artisan (Sleek commission ${naira(escrow.commission!)}).`);
        notify(a.id, 'Payment released', `${naira(escrow.releasedToArtisan!)} for “${j.title}” is now in your earnings.`, '/earnings');
        notify(j.customerId, reason === 'auto_release' ? 'Payment auto-released' : 'Job completed', `“${j.title}” is complete. Please rate your artisan.`, `/review/${j.id}`);
      };

      const releaseFee = (jobId: ID, why: string) => {
        const j = job(jobId);
        if (!j?.fee || j.fee.status !== 'held') return;
        const { commission, toArtisan } = feeSplit(j.fee.amount, rate());
        const at = nowIso();
        patchJob(jobId, (x) => ({ fee: { ...x.fee!, status: 'released', releasedAt: at, commission, toArtisan }, timeline: timeline(x, `${FEE_LABEL[x.fee!.type]} released to the artisan (${why})`, 'system') }));
        set((st) => ({ ledger: [{ id: uid('led'), artisanId: j.artisanId, jobId, type: 'fee_release', amount: toArtisan, at, note: `${FEE_LABEL[j.fee!.type]}: ${j.title}` }, ...st.ledger] }));
        notify(j.artisanId, `${FEE_LABEL[j.fee.type]} released`, `${naira(toArtisan)} for “${j.title}” is in your earnings (after ${Math.round(rate() * 100)}% Sleek commission).`, '/earnings', 'payments');
      };
      const refundFee = (jobId: ID, why: string) => {
        const j = job(jobId);
        if (!j?.fee || j.fee.status !== 'held') return;
        patchJob(jobId, (x) => ({ fee: { ...x.fee!, status: 'refunded', refundedAt: nowIso() }, timeline: timeline(x, `${FEE_LABEL[x.fee!.type]} refunded (${why})`, 'system') }));
        logProvider('payments', 'refund', `${providerInfo('payments').name}: ${FEE_LABEL[j.fee.type].toLowerCase()} of ${naira(j.fee.amount)} refunded`);
        notify(j.customerId, `${FEE_LABEL[j.fee.type]} refunded`, `${naira(j.fee.amount)} for “${j.title}” is on its way back to you.`, `/job/${jobId}`, 'payments');
      };
      const FEE_FIRST = (j: Job) => `Pay the ${naira(j.fee!.amount)} ${FEE_LABEL[j.fee!.type].toLowerCase()} first. It waits in Sleek Hold until the artisan engages.`;

      return {
        ...initialData(),
        hydrated: false,

        // ---- session -------------------------------------------------------
        completeOnboarding: () => set({ onboarded: true }),
        signInDemo: (kind) => {
          const map = {
            customer: { userId: DEMO_CUSTOMER_ID, role: 'customer' as const, phone: '+2348000000001' },
            artisan: { userId: DEMO_ARTISAN_ID, role: 'artisan' as const, phone: '+2348000000000' },
            team: { userId: 'art_brightclean', role: 'artisan' as const, phone: '+2348000000002' },
            agency: { userId: 'art_buildpro', role: 'artisan' as const, phone: '+2348000000003' },
            seller: { userId: DEMO_SELLER_ID, role: 'seller' as const, phone: '+2348000000004' },
          };
          set({ session: { ...map[kind], token: uid('tok') }, onboarded: true });
        },
        sendSignInCode: (phone) => {
          const code = demoCode(`sms:${phone}:${Math.floor(Date.now() / 300_000)}`);
          logProvider('sms', 'otp', `${providerInfo('sms').name}: sign-in code sent to •••• ${phone.replace(/\D/g, '').slice(-4)}`);
          return code;
        },
        sendEmailCode: (email) => {
          const code = demoCode(`email:${email.toLowerCase()}:${Math.floor(Date.now() / 600_000)}`);
          sendEmail(email.trim(), 'Your Sleek confirmation code', `Your code is ${code}. It expires in 10 minutes. Sleek staff will never ask you for it.`);
          return code;
        },
        register: ({ phone: rawPhone, name, role, accountType, businessName, email, city, area, referralCode, authProvider, consents }) => {
          const digits = rawPhone.replace(/\D/g, '');
          const phone = digits ? (digits.startsWith('234') ? `+${digits}` : `+234${digits.replace(/^0/, '')}`) : rawPhone;
          const everyone = [...get().customers, ...get().artisans, ...get().sellers];
          const taken = everyone.some((u) => u.phone.replace(/\D/g, '').slice(-10) === digits.slice(-10));
          if (digits && taken) return fail('An account already uses this phone number. Sign in instead. One person, one account.');
          if (email && everyone.some((u) => 'email' in u && u.email?.toLowerCase() === email.trim().toLowerCase())) return fail('An account already uses this email. Sign in instead.');
          const meta = { authProvider: authProvider ?? 'phone', consents: consents ?? [], phoneVerified: true, emailVerified: !!email };
          if (role !== 'customer' && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email ?? '')) return fail('Enter a valid email address. We send your verification results there.');
          if (role === 'seller') {
            if ((businessName ?? '').trim().length < 2) return fail('Enter your shop or business name.');
            const sid = uid('sel');
            const sel: Seller = { id: sid, role: 'seller', name, businessName: businessName!.trim(), phone, email: email!.trim(), area, city, joinedAt: nowIso(), identity: emptyIdentity(), storeLive: false, avatarColor: '#0284C7', ...meta };
            set((s) => ({ sellers: [...s.sellers, sel], session: { userId: sid, role: 'seller', phone, token: uid('tok') }, onboarded: true }));
            notify(sid, 'Welcome to Sleek Services', 'Finish verification to open your store: identity, guarantor and business registration.', '/verify');
            sendEmail(sel.email, 'Welcome to Sleek Services', `Hi ${name.split(' ')[0]}, finish verification in the app (identity, guarantor and business registration) to open ${sel.businessName} on Sleek Services.`, sid);
            return ok(undefined);
          }
          let referrer: { id: ID; name: string } | undefined;
          if (referralCode?.trim()) {
            const code = referralCode.trim().toUpperCase();
            referrer = [...get().customers, ...get().artisans].map((u) => ({ id: u.id, name: u.name })).find((u) => referralCodeOf(u.id, u.name) === code);
            if (!referrer) return fail('That referral code wasn’t found. Check it, or leave it empty.');
          }
          const id = uid(role === 'customer' ? 'cus' : 'art');
          if (role === 'customer') {
            const c: Customer = { id, role: 'customer', name, phone, email: email?.trim() || undefined, ...meta, identity: emptyIdentity(), area, city, joinedAt: nowIso(), addresses: [{ label: 'Home', line1: 'Add your street address', area, city, state: city }] };
            set((s) => ({ customers: [...s.customers, c] }));
          } else {
            const a: Artisan = {
              id,
              role: 'artisan',
              accountType: accountType ?? 'individual',
              businessName,
              name,
              phone,
              bio: '',
              area,
              city,
              yearsExperience: 1,
              online: false,
              identity: emptyIdentity(),
              skills: [],
              startingPrices: {},
              stats: { completedJobs: 0, cancelledByArtisan: 0, disputesOpened: 0, disputesLost: 0, ruleViolations: 0, ratingSum: 0, ratingCount: 0, onTimeRate: 1 },
              workers: [],
              calendarMode: accountType && accountType !== 'individual' ? 'shared' : undefined,
              workingHours: { 0: null, 1: { start: 8, end: 18 }, 2: { start: 8, end: 18 }, 3: { start: 8, end: 18 }, 4: { start: 8, end: 18 }, 5: { start: 8, end: 18 }, 6: { start: 9, end: 15 } },
              joinedAt: nowIso(),
              email: email?.trim(),
              ...meta,
              avatarColor: '#0EA5E9',
              business: accountType && accountType !== 'individual' ? { serviceAreas: [area], teamSize: 1, completedOnboarding: false } : undefined,
            };
            set((s) => ({ artisans: [...s.artisans, a] }));
            notify(id, 'Welcome to Sleek', 'Finish verification to open your account: identity, guarantor and a live skill video.', '/verify');
            sendEmail(a.email, 'Welcome to Sleek', `Hi ${name.split(' ')[0]}, finish verification in the app: NIN and face check, a guarantor${accountType && accountType !== 'individual' ? ', your CAC registration' : ''} and a live video for each skill. Your account opens as soon as everything passes.`, id);
          }
          if (referrer) {
            const ref: Referral = { id: uid('ref'), code: referralCode!.trim().toUpperCase(), referrerId: referrer.id, refereeId: id, refereeName: `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] ?? ''}.`, refereeRole: role === 'customer' ? 'customer' : 'artisan', status: 'pending', reward: REFERRAL_REWARD[role === 'customer' ? 'customer' : 'artisan'], at: nowIso() };
            set((s) => ({ referrals: [ref, ...s.referrals] }));
            notify(referrer.id, 'Your friend joined Sleek', `${ref.refereeName} signed up with your code. You’ll earn ${naira(ref.reward)} when they qualify.`, '/referrals', 'referrals');
          }
          set({ session: { userId: id, role, phone, token: uid('tok') }, onboarded: true });
          return ok(undefined);
        },
        signOut: () => set({ session: {} }),
        setTheme: (mode) => set((s) => ({ settings: { ...s.settings, themeMode: mode } })),
        updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
        resetDemo: () => set({ ...initialData(), onboarded: true, session: {} }),

        // ---- customer extras ---------------------------------------------
        toggleFavourite: (artisanId) => {
          const id = me().userId;
          let now = false;
          set((s) => ({
            customers: s.customers.map((c) => {
              if (c.id !== id) return c;
              const has = (c.favourites ?? []).includes(artisanId);
              now = !has;
              return { ...c, favourites: has ? (c.favourites ?? []).filter((x) => x !== artisanId) : [...(c.favourites ?? []), artisanId] };
            }),
          }));
          return now;
        },
        setMatchingPrefs: (p) => set((s) => ({ customers: s.customers.map((c) => (c.id === s.session.userId ? { ...c, prefs: { ...DEFAULT_PREFS, ...c.prefs, ...p } } : c)) })),
        setTrustedContact: (c) => {
          if (c && !/^(0[789][01]\d{8}|234[789][01]\d{8})$/.test(c.phone.replace(/\D/g, ''))) return fail('Enter a valid Nigerian mobile number.');
          const uidMe = me().userId;
          set((s) => ({ customers: s.customers.map((x) => (x.id === uidMe ? { ...x, trustedContact: c } : x)) }));
          return ok(undefined);
        },
        addTip: async (jobId, amount, method) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can tip.');
          const err = validateTip(j, amount);
          if (err) return fail(err);
          if (isOffline()) return fail(OFFLINE);
          const res = await payments.payOrder({ orderId: `tip_${jobId}`, amount, method });
          if (!res.ok) return fail(res.error ?? 'Payment failed.');
          patchJob(jobId, (x) => ({ tip: { amount, at: nowIso(), reference: res.reference! }, timeline: timeline(x, `Customer added a ${naira(amount)} tip`, 'customer') }));
          set((s) => ({ ledger: [{ id: uid('led'), artisanId: j.artisanId, jobId, type: 'tip', amount, at: nowIso(), note: `Tip: ${j.title}` }, ...s.ledger] }));
          notify(j.artisanId, 'You received a tip 🎉', `${naira(amount)} tip for “${j.title}”. Tips are 100% yours.`, '/earnings', 'payments');
          return ok(undefined);
        },
        decideExtension: (jobId, approve) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can approve more time.');
          const req = pendingExtension(j);
          if (!req) return fail('There is no request waiting.');
          if (approve && extensionClashes(j, req.extraMinutes, get().jobs)) return fail('The artisan has another booking right after — they can’t stay longer. Decline and agree a follow-up job instead.');
          patchJob(jobId, (x) => ({
            window: approve ? { ...x.window, end: req.newEnd } : x.window,
            extensions: (x.extensions ?? []).map((e) => (e.id === req.id ? { ...e, status: approve ? 'approved' : 'declined', decidedAt: nowIso() } : e)),
            timeline: timeline(x, approve ? `More time approved (+${req.extraMinutes} min)` : 'More time declined', 'customer'),
          }));
          sys(jobId, approve ? `Customer approved ${req.extraMinutes} more minutes. New finish time: ${new Date(req.newEnd).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}. The price stays the same unless you agree a new job.` : 'Customer declined the request for more time.');
          notify(j.artisanId, approve ? 'More time approved' : 'More time declined', `“${j.title}”`, `/job/${jobId}`, 'job_progress');
          return ok(undefined);
        },
        submitGuaranteeClaim: (jobId, details, evidence) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can claim.');
          const a = artisanById(j.artisanId)!;
          if (!protectionEligible(j, a, category(j.categoryId), Date.now()).eligible) return fail('This job is not covered by Sleek Protection.');
          const w = protectionWindow(j);
          if (!w.open || new Date(w.until!).getTime() < Date.now()) return fail('The 7-day protection window for this job has closed.');
          if (j.guaranteeClaimId) return fail('You already made a claim for this job.');
          if (details.trim().length < 20) return fail('Describe what went wrong (at least 20 characters).');
          const c: GuaranteeClaim = { id: uid('gc'), jobId, customerId: j.customerId, details: details.trim(), evidence, status: 'submitted', at: nowIso() };
          set((s) => ({ guaranteeClaims: [c, ...s.guaranteeClaims] }));
          patchJob(jobId, (x) => ({ guaranteeClaimId: c.id, timeline: timeline(x, 'Sleek Protection claim submitted', 'customer') }));
          for (const id of adminIds()) notify(id, 'Protection claim', `${j.title} — up to ${naira(protectionCover(j))}`, undefined, 'disputes');
          notify(j.artisanId, 'Protection claim on a past job', `The customer reported a problem with “${j.title}”. Sleek may contact you in chat.`, `/job/${jobId}`, 'disputes');
          return ok(c.id);
        },
        addDisputeEvidence: (disputeId, media) => {
          const d = get().disputes.find((x) => x.id === disputeId);
          const j = d && job(d.jobId);
          if (!d || !j || !myParty(j)) return fail('Dispute not found.');
          if (d.status === 'resolved') return fail('This dispute is closed.');
          if (media.purpose !== 'dispute_evidence') return fail('Only dispute evidence photos can be added here.');
          set((s) => ({ disputes: s.disputes.map((x) => (x.id === disputeId ? { ...x, evidence: [...x.evidence, media] } : x)) }));
          return ok(undefined);
        },

        // ---- artisan extras ----------------------------------------------------
        markEnRoute: (jobId) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can do this.');
          if (!canMarkEnRoute(j, Date.now())) return fail('You can mark “on my way” from 3 hours before the job, once Sleek Hold is funded.');
          patchJob(jobId, (x) => ({ enRouteAt: nowIso(), timeline: timeline(x, 'Artisan is on the way', 'artisan') }));
          sys(jobId, 'The artisan is on the way.');
          notify(j.customerId, 'Your artisan is on the way', `For “${j.title}”.`, `/job/${jobId}`, 'job_progress');
          return ok(undefined);
        },
        requestExtension: (jobId, extraMinutes, reason) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can ask for more time.');
          const err = validateExtension(j, extraMinutes, reason);
          if (err) return fail(err);
          const m = moderateMessage(reason);
          if (!m.allowed) return fail(m.warning!);
          if (extensionClashes(j, extraMinutes, get().jobs)) return fail('That would overlap your next booking. Ask for less time.');
          const newEnd = new Date(new Date(j.window.end).getTime() + extraMinutes * 60_000).toISOString();
          patchJob(jobId, (x) => ({ extensions: [...(x.extensions ?? []), { id: uid('ext'), extraMinutes, newEnd, reason: reason.trim(), status: 'pending', at: nowIso() }], timeline: timeline(x, `Artisan asked for ${extraMinutes} more minutes`, 'artisan') }));
          sys(jobId, `The artisan is asking for ${extraMinutes} more minutes: “${reason.trim()}”. The customer can approve or decline on the job page.`);
          notify(j.customerId, 'Artisan needs more time', `${extraMinutes} more minutes for “${j.title}”. Approve or decline.`, `/job/${jobId}`, 'job_progress');
          return ok(undefined);
        },
        rateCustomer: (jobId, r) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can rate the customer.');
          if (j.status !== 'completed' && j.status !== 'resolved') return fail('You can rate the customer once the job is complete.');
          if (j.customerReviewId) return fail('You already rated this customer.');
          const err = validateCustomerReview(r);
          if (err) return fail(err);
          const m = moderateMessage(r.comment);
          if (!m.allowed) return fail(m.warning!);
          const rev: CustomerReview = { id: uid('crev'), jobId, customerId: j.customerId, artisanId: j.artisanId, professionalism: r.professionalism, clarity: r.clarity, payment: r.payment, comment: r.comment.trim(), at: nowIso() };
          set((s) => ({
            customerReviews: [rev, ...s.customerReviews],
            customers: s.customers.map((c) => {
              if (c.id !== j.customerId) return c;
              const st = c.customerStats ?? { ratingCount: 0, professionalismSum: 0, claritySum: 0, paymentSum: 0 };
              return { ...c, customerStats: { ratingCount: st.ratingCount + 1, professionalismSum: st.professionalismSum + r.professionalism, claritySum: st.claritySum + r.clarity, paymentSum: st.paymentSum + r.payment } };
            }),
          }));
          patchJob(jobId, () => ({ customerReviewId: rev.id }));
          return ok(undefined);
        },
        setPayoutSchedule: (sc) => patchArtisan(me().userId!, () => ({ payoutSchedule: sc })),
        addTimeOff: (t) => {
          if (!(new Date(t.end).getTime() > new Date(t.start).getTime())) return fail('The end must be after the start.');
          const a = artisanById(me().userId!);
          if (!a) return fail('Artisan accounts only.');
          const clash = get().jobs.find((j) => j.artisanId === a.id && Esc.BLOCKING_STATUSES.includes(j.status) && new Date(j.window.start) < new Date(t.end) && new Date(j.window.end) > new Date(t.start));
          if (clash) return fail(`You have a funded job then (“${clash.title}”). Finish or cancel it first.`);
          patchArtisan(a.id, (x) => ({ timeOff: [...(x.timeOff ?? []), { ...t, id: uid('off') }] }));
          return ok(undefined);
        },
        removeTimeOff: (id) => patchArtisan(me().userId!, (x) => ({ timeOff: (x.timeOff ?? []).filter((t) => t.id !== id) })),
        updateWorker: (workerId, p) => patchArtisan(me().userId!, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, ...p } : w)) })),
        removeWorker: (workerId) => {
          const a = artisanById(me().userId!);
          if (!a) return fail('Not found.');
          if (get().jobs.some((j) => j.workerId === workerId && Esc.ACTIVE_STATUSES.includes(j.status))) return fail('This worker has active jobs. Reassign them first.');
          patchArtisan(a.id, (x) => ({ workers: x.workers.filter((w) => w.id !== workerId) }));
          return ok(undefined);
        },
        completeBusinessOnboarding: (d) => {
          const a = artisanById(me().userId!);
          if (!a || a.accountType === 'individual') return fail('Team and Agency accounts only.');
          if (!d.cacPending && !/^(RC|BN)?\s?\d{5,8}$/i.test((d.cacNumber ?? '').trim())) return fail('Enter a valid CAC number (e.g. RC 1234567), or tick “Not registered yet”.');
          if (!d.serviceAreas.length) return fail('Add at least one area you serve.');
          patchArtisan(a.id, () => ({ business: { ...d, completedOnboarding: true } }));
          return ok(undefined);
        },
        submitCertificate: (categoryId, media, workerId) => {
          const id = me().userId!;
          if (media.purpose !== 'certificate') return fail('Take the certificate photo in the app.');
          const upd = (skills: SkillVerification[]) => skills.map((k) => (k.categoryId === categoryId ? { ...k, certificate: media, status: k.status === 'needs_more' || k.status === 'rejected' ? ('in_review' as const) : k.status } : k));
          if (workerId) patchArtisan(id, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, skills: upd(w.skills) } : w)) }));
          else patchArtisan(id, (a) => ({ skills: upd(a.skills) }));
          for (const adm of adminIds()) notify(adm, 'Certificate uploaded', `${nameOf(id)} — ${category(categoryId).name}`, undefined, 'verification');
          return ok(undefined);
        },

        // ---- shared extras ---------------------------------------------------
        raiseSafetyAlert: (kind, note, jobId) => {
          const s0 = me();
          const alert: SafetyAlert = { id: uid('sos'), userId: s0.userId!, role: s0.role === 'artisan' ? 'artisan' : 'customer', jobId, kind, note: note.trim(), at: nowIso(), status: 'open' };
          set((s) => ({ safetyAlerts: [alert, ...s.safetyAlerts] }));
          if (jobId) patchJob(jobId, (x) => ({ safetyAlertIds: [...(x.safetyAlertIds ?? []), alert.id] }));
          if (kind !== 'shared_with_contact') {
            for (const id of adminIds()) notify(id, kind === 'sos' ? '🚨 SOS from a user' : 'Safety concern reported', `${nameOf(alert.userId)}${jobId ? ` · job ${jobId.slice(-6).toUpperCase()}` : ''}${note ? ` — ${note.slice(0, 60)}` : ''}`, undefined, 'safety');
            notify(alert.userId, 'Sleek Safety has been alerted', 'A safety agent will contact you in the app within minutes. If you are in danger, call 112.', '/trust-safety', 'safety');
          }
          return alert;
        },
        setNotificationPref: (category, enabled) =>
          set((s) => {
            const id = s.session.userId!;
            const cur = s.notificationPrefs[id] ?? DEFAULT_NOTIFICATION_PREFS;
            return { notificationPrefs: { ...s.notificationPrefs, [id]: { ...cur, enabled: { ...cur.enabled, [category]: enabled } } } };
          }),
        setQuietHours: (q) =>
          set((s) => {
            const id = s.session.userId!;
            const cur = s.notificationPrefs[id] ?? DEFAULT_NOTIFICATION_PREFS;
            return { notificationPrefs: { ...s.notificationPrefs, [id]: { ...cur, quietHours: q } } };
          }),
        setLanguage: (l) => set((s) => ({ settings: { ...s.settings, language: l } })),
        dismissTip: (tipId) => set((s) => ({ settings: { ...s.settings, seenTips: [...new Set([...(s.settings.seenTips ?? []), tipId])] } })),
        setNetwork: (n) => {
          const wasOffline = !get().network.online;
          set({ network: n });
          if (wasOffline && n.online) get().flushOutbox();
        },
        recentTextsBy: (jobId, from) => {
          const since = Date.now() - 15 * 60_000;
          const sent = get().messages.filter((m) => m.jobId === jobId && m.from === from && m.kind === 'text' && new Date(m.at).getTime() >= since);
          const queued = get().outbox.filter((m) => m.jobId === jobId && m.from === from);
          return [...sent, ...queued].map((m) => m.text).slice(-4);
        },
        flushOutbox: () => {
          const queued = get().outbox;
          if (!queued.length || isOffline()) return;
          set({ outbox: [] });
          for (const m of queued) set((s) => ({ messages: [...s.messages, { id: m.id, jobId: m.jobId, from: m.from, kind: 'text', text: m.text, at: m.at }] }));
        },

        // ---- admin extras ------------------------------------------------------
        updateSafetyAlert: (id, status) => {
          const a = get().safetyAlerts.find((x) => x.id === id);
          set((s) => ({ safetyAlerts: s.safetyAlerts.map((x) => (x.id === id ? { ...x, status, handledBy: adminActor?.name ?? 'Sleek Safety', handledAt: nowIso() } : x)) }));
          if (a && status === 'acknowledged') notify(a.userId, 'Sleek Safety is on it', 'A safety agent has seen your alert and is following up.', '/trust-safety', 'safety');
        },
        addAdminNote: (targetType, targetId, text) => {
          if (!adminActor) return fail('Only Sleek staff can add notes.');
          if (text.trim().length < 3) return fail('Write a note.');
          set((s) => ({ adminNotes: [{ id: uid('an'), targetType, targetId, by: adminActor!.name, text: text.trim(), at: nowIso() }, ...s.adminNotes] }));
          return ok(undefined);
        },
        decideGuaranteeClaim: (id, approve, payout) => {
          if (!adminActor) return fail('Only Sleek staff can decide claims.');
          const c = get().guaranteeClaims.find((x) => x.id === id);
          const j = c && job(c.jobId);
          if (!c || !j) return fail('Claim not found.');
          if (c.status !== 'submitted') return fail('Already decided.');
          const amount = approve ? Math.min(protectionCover(j), Math.max(0, Math.round(payout))) : 0;
          set((s) => ({ guaranteeClaims: s.guaranteeClaims.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'declined', payout: amount } : x)) }));
          notify(c.customerId, approve ? 'Protection claim approved' : 'Protection claim declined', approve ? `Sleek will pay ${naira(amount)} to your original payment method.` : 'After review, this issue isn’t covered. See Help for details.', `/job/${j.id}`, 'disputes');
          return ok(undefined);
        },

        // ---- jobs ----------------------------------------------------------
        createJob: (input) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const s = me();
          if (s.role !== 'customer' || !s.userId) return fail('Only customers can book artisans.');
          if (isSuspended(s.userId)) return fail(SUSPENDED);
          if (artisanById(input.artisanId)?.suspended) return fail('This artisan is not taking bookings right now.');
          const cust0 = get().customers.find((c) => c.id === s.userId);
          if (cust0?.identity?.nin !== 'passed') return fail('Verify your account first (NIN check, about a minute). Go to Profile → Verify my account.');
          const customer = get().customers.find((c) => c.id === s.userId)!;
          const a = artisanById(input.artisanId);
          if (!a) return fail('Artisan not found.');
          const check = bookableFor(get().jobs, a, input.categoryId, input.window);
          if (!check.ok) return fail(check.reason!);
          const id = uid('job');
          const at = nowIso();
          const j: Job = {
            id,
            customerId: customer.id,
            artisanId: a.id,
            workerId: input.workerId,
            categoryId: input.categoryId,
            title: input.title.trim() || category(input.categoryId).name,
            description: input.description.trim(),
            window: input.window,
            address: customer.addresses[input.addressIndex] ?? customer.addresses[0],
            size: category(input.categoryId).defaultSize,
            status: 'requested',
            pricePool: Pool.emptyPool(),
            escrow: { state: 'none', amount: 0 },
            issuePhotos: input.issuePhotos,
            createdAt: at,
            updatedAt: at,
            timeline: [{ at, label: input.origin === 'ugent' ? 'Request sent by Ugent (confirmed by you)' : `Request sent to ${a.businessName ?? a.name}`, by: input.origin === 'ugent' ? 'ugent' : 'customer' }],
            origin: input.origin ?? 'app',
            fee: { ...feeFor(a, input.categoryId, get().platformConfig?.tradeFeeTypes), status: 'unpaid' },
          };
          if (input.origin === 'match') {
            j.timeline = [{ at, label: `Sleek matched you with ${a.businessName ?? a.name}`, by: 'system' }];
            const start = a.startingPrices[input.categoryId];
            if (start) {
              try {
                j.pricePool = Pool.propose(j.pricePool, 'artisan', start, uid('off'), at, 'Starting price. Tell me more and I can confirm.');
              } catch {
                // no opening offer
              }
            }
          }
          set((st) => ({ jobs: [j, ...st.jobs] }));
          sys(id, 'Chat is protected by Sleek. Phone numbers, emails, links and off-app contact are blocked here. Your exact address and both phone numbers unlock as soon as the payment is secured in Sleek Hold.');
          if (input.issuePhotos.length) {
            for (const m of input.issuePhotos) set((st) => ({ messages: [...st.messages, { id: uid('msg'), jobId: id, from: 'customer', kind: 'media', text: 'Photo of the issue', at, media: m }] }));
          }
          if (j.pricePool.offers.length) set((st) => ({ messages: [...st.messages, { id: uid('msg'), jobId: id, from: 'artisan', kind: 'price', text: `Proposed ${naira(j.pricePool.offers[0].amount)}`, at, offerId: j.pricePool.offers[0].id }] }));
          // The artisan is told once the upfront fee is paid (payFee).
          return ok(id);
        },

        sendMessage: (jobId, text) => {
          const j = job(jobId);
          const party = j && myParty(j);
          const res = moderateMessage(text, { recent: party ? get().recentTextsBy(jobId, party) : [] });
          if (!j || !party) return { ...res, allowed: false, warning: 'You are not part of this job.' };
          if (!text.trim()) return { ...res, allowed: false, warning: undefined };
          if (['completed', 'resolved', 'cancelled', 'declined'].includes(j.status)) return { ...res, allowed: false, warning: 'This job is closed. Chat is read-only.' };
          if (isSuspended(me().userId)) return { ...res, allowed: false, warning: SUSPENDED };
          if (!feePaid(j)) return { ...res, allowed: false, warning: party === 'customer' ? FEE_FIRST(j) : `Chat opens when the customer pays your ${FEE_LABEL[j.fee!.type].toLowerCase()}. You can still change the fee below.` };
          if (!res.allowed) {
            const userId = me().userId!;
            const strikes = get().violations.filter((v) => v.userId === userId && Date.now() - new Date(v.at).getTime() < 30 * 86_400_000).length + 1;
            if (strikes >= (get().platformConfig?.offAppStrikesToSuspend ?? 5)) {
              const reason = `Automatic: ${strikes} attempts to share contact details or move off Sleek in 30 days.`;
              set((s) => ({
                customers: s.customers.map((c) => (c.id === userId ? { ...c, suspended: true, suspendedReason: reason } : c)),
                artisans: s.artisans.map((x) => (x.id === userId ? { ...x, suspended: true, suspendedReason: reason, online: false } : x)),
              }));
              for (const adm of adminIds()) notify(adm, 'Account auto-suspended', `${nameOf(userId)} — ${strikes} off-app attempts`, undefined, 'safety');
            }
            set((s) => ({ violations: [{ id: uid('vio'), userId, role: party, jobId, types: res.violations, excerpt: res.redacted, at: nowIso(), reviewed: false }, ...s.violations] }));
            if (party === 'artisan') patchArtisan(userId, (a) => ({ stats: { ...a.stats, ruleViolations: a.stats.ruleViolations + 1, lastViolationAt: nowIso() } }));
            return res;
          }
          if (isOffline()) {
            // Already checked by the content guard; queued and sent automatically when the network is back.
            set((s) => ({ outbox: [...s.outbox, { id: uid('msg'), jobId, from: party, text: text.trim(), at: nowIso() }] }));
            return res;
          }
          set((s) => ({ messages: [...s.messages, { id: uid('msg'), jobId, from: party, kind: 'text', text: text.trim(), at: nowIso() }] }));
          return res;
        },

        proposePrice: (jobId, amount, note) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          if (j.status !== 'requested') return fail('The price can only be negotiated before it is locked.');
          if (!feePaid(j)) return fail(party === 'customer' ? FEE_FIRST(j) : 'The customer hasn’t paid your upfront fee yet.');
          if (note) {
            const m = moderateMessage(note);
            if (!m.allowed) return fail(m.warning!);
          }
          try {
            const offerId = uid('off');
            const pool = Pool.propose(j.pricePool, party, amount, offerId, nowIso(), note?.trim() || undefined);
            const counter = j.pricePool.offers.some((o) => o.status === 'pending');
            patchJob(jobId, () => ({ pricePool: pool }));
            set((s) => ({ messages: [...s.messages, { id: uid('msg'), jobId, from: party, kind: 'price', text: `${counter ? 'Counter-offer' : 'Proposed'} ${naira(amount)}`, at: nowIso(), offerId }] }));
            notify(party === 'customer' ? j.artisanId : j.customerId, counter ? 'Counter-offer received' : 'New price offer', `${naira(amount)} for “${j.title}”.`, `/chat/${jobId}`);
            if (party === 'artisan' && j.fee && releasesOn(j.fee, 'engaged')) releaseFee(jobId, 'artisan responded with a price');
            return ok(undefined);
          } catch (e) {
            return fail((e as Error).message);
          }
        },

        acceptPrice: (jobId) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          try {
            const pool = Pool.accept(j.pricePool, party, nowIso());
            const amount = pool.locked!.amount;
            const size = Esc.classifyJobSize(amount, j.window.start, j.window.end, category(j.categoryId).defaultSize);
            patchJob(jobId, (x) => ({ pricePool: pool, status: 'price_agreed', size, timeline: timeline(x, `Price locked at ${naira(amount)}`, party) }));
            sys(jobId, `Price locked at ${naira(amount)}. This is now permanent for this job. Next: the customer pays into Sleek Hold.`);
            if (j.fee && releasesOn(j.fee, 'price_agreed')) releaseFee(jobId, 'price agreed');
            notify(party === 'customer' ? j.artisanId : j.customerId, 'Price agreed', `${naira(amount)} locked for “${j.title}”.`, `/job/${jobId}`);
            return ok(undefined);
          } catch (e) {
            return fail((e as Error).message);
          }
        },

        withdrawOffer: (jobId) => {
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          try {
            patchJob(jobId, () => ({ pricePool: Pool.withdraw(j.pricePool, party) }));
            sys(jobId, `${party === 'customer' ? 'Customer' : 'Artisan'} withdrew their offer.`);
            return ok(undefined);
          } catch (e) {
            return fail((e as Error).message);
          }
        },

        declineJob: (jobId, reason) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can decline.');
          if (j.status !== 'requested' && j.status !== 'price_agreed') return fail('This job can no longer be declined. Use cancel instead.');
          patchJob(jobId, (x) => ({ status: 'declined', timeline: timeline(x, `Artisan declined: ${reason}`, 'artisan') }));
          refundFee(jobId, 'artisan declined');
          sys(jobId, j.fee?.status === 'held' ? `The artisan declined this request. Your ${FEE_LABEL[j.fee.type].toLowerCase()} is being refunded.` : 'The artisan declined this request. No payment was taken.');
          notify(j.customerId, 'Request declined', `“${j.title}” was declined. Try another available artisan.`, `/job/${jobId}`);
          return ok(undefined);
        },

        fundEscrow: async (jobId, method) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can pay into Sleek Hold.');
          if (!Esc.canFund(j)) return fail('Agree a price in the Price Pool first.');
          const a = artisanById(j.artisanId)!;
          // Re-check capacity at payment time — another customer may have booked the slot.
          let workerId = j.workerId;
          if (a.accountType !== 'individual' && a.workers.length) {
            const free = freeWorkersFor(get().jobs, a, j.categoryId, j.window);
            if (workerId && !free.includes(workerId)) workerId = undefined;
            workerId = workerId ?? free[0];
            if (!workerId) return fail('This team has no free verified worker for that time any more. Pick another time.');
          } else if (!workerFreeFor(get().jobs, a, a.id, j.window)) {
            return fail('The artisan was just booked for an overlapping time. Please choose another time.');
          }
          if (isOffline()) return fail(OFFLINE);
          if (isSuspended(me().userId)) return fail(SUSPENDED);
          const res = await payments.fundEscrow({ jobId, amount: j.pricePool.locked!.amount, method });
          logProvider('payments', 'charge', `${providerInfo('payments').name}: ${method} charge of ${naira(j.pricePool.locked!.amount)} into Sleek Hold ${res.ok ? 'succeeded' : 'failed'}`, res.ok);
          if (!res.ok) return fail(res.error ?? 'Payment failed. You have not been charged.');
          const fresh = job(jobId)!;
          const escrow = Esc.fundEscrow(fresh, res.reference!, nowIso());
          patchJob(jobId, (x) => ({ escrow, status: 'funded', workerId, timeline: timeline(x, `${naira(escrow.amount)} paid into Sleek Escrow`, 'customer') }));
          sys(jobId, `Escrow funded: ${naira(escrow.amount)} is held safely by Sleek. The job address and both phone numbers are now unlocked on the job page.`);
          notify(a.id, 'Paid into Sleek Hold — job confirmed', `${naira(escrow.amount)} is held for “${j.title}”. Address unlocked.`, `/job/${jobId}`);
          return ok(res.reference!);
        },

        assignWorker: (jobId, workerId) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the account owner can assign workers.');
          const a = artisanById(j.artisanId)!;
          if (!workerSkillApproved(a, workerId, j.categoryId)) return fail('This worker is not verified for this skill.');
          const others = get().jobs.filter((x) => x.id !== jobId);
          if (!workerFreeFor(others, a, workerId, j.window)) return fail('This worker already has a job at an overlapping time.');
          const w = a.workers.find((x) => x.id === workerId);
          patchJob(jobId, (x) => ({ workerId, timeline: timeline(x, `Assigned to ${w?.name ?? 'worker'}`, 'artisan') }));
          sys(jobId, `${w?.name ?? 'A verified worker'} from ${a.businessName ?? a.name} has been assigned to this job.`);
          return ok(undefined);
        },

        startJob: (jobId) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can start the job.');
          if (!Esc.canStart(j, Date.now())) return fail('You can start from 1 hour before the agreed time, once Sleek Hold is funded.');
          patchJob(jobId, (x) => ({ status: 'in_progress', startedAt: nowIso(), enRouteAt: x.enRouteAt, timeline: timeline(x, 'Artisan started work', 'artisan') }));
          sys(jobId, 'The artisan has started work.');
          notify(j.customerId, 'Work started', `Your artisan has started “${j.title}”.`, `/job/${jobId}`);
          return ok(undefined);
        },

        logCapture: (purpose, uri, jobId) => {
          const m: CapturedMedia = { id: uid('med'), uri, purpose, capturedAt: nowIso(), loggedBy: me().userId ?? 'anon' };
          logProvider('vision', 'scan', `${providerInfo('vision').name}: photo scanned for phone numbers and contact details, none found`);
          logProvider('storage', 'upload', `${providerInfo('storage').name}: ${purpose.replace(/_/g, ' ')} photo stored privately`);
          set((s) => ({ uploadLog: [{ ...m, ...(jobId ? { purpose } : {}) }, ...s.uploadLog] }));
          return m;
        },

        addIssuePhoto: (jobId, media) => {
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          if (media.purpose !== 'issue_photo' && media.purpose !== 'site_before') return fail('That upload type is not allowed here.');
          patchJob(jobId, (x) => ({ issuePhotos: [...x.issuePhotos, media] }));
          set((s) => ({
            messages: [...s.messages, { id: uid('msg'), jobId, from: party, kind: 'media', text: media.purpose === 'issue_photo' ? 'Photo of the issue' : 'Site photo before work', at: nowIso(), media }],
          }));
          return ok(undefined);
        },

        submitProof: (jobId, photos, note) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can upload proof of work.');
          if (!Esc.canSubmitProof(j)) return fail('Start the job before uploading proof of work.');
          if (photos.length < 1) return fail('Add at least one photo of the finished work.');
          const m = moderateMessage(note);
          if (!m.allowed) return fail(m.warning!);
          const submittedAt = nowIso();
          const autoReleaseAt = Esc.autoReleaseAt(submittedAt, j.size);
          patchJob(jobId, (x) => ({ status: 'proof_submitted', proof: { photos, note: note.trim(), submittedAt, autoReleaseAt }, timeline: timeline(x, 'Proof of work uploaded', 'artisan') }));
          sys(jobId, `Proof of work uploaded. The customer has ${Esc.AUTO_RELEASE_HOURS[j.size]} hours to approve or dispute, after which payment is released automatically.`);
          notify(j.customerId, 'Please review the work', `Proof of work for “${j.title}” is ready. Approve or raise a dispute within ${Esc.AUTO_RELEASE_HOURS[j.size]}h.`, `/proof/${jobId}`);
          return ok(undefined);
        },

        approveJob: (jobId) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can approve.');
          if (!Esc.canApprove(j)) return fail('There is nothing to approve yet.');
          releaseToArtisan(j, 'customer_approved');
          return ok(undefined);
        },

        cancelJob: (jobId, reason) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          try {
            if (j.fee?.status === 'held') refundFee(jobId, `cancelled by the ${party}`);
            if (j.fee?.status === 'unpaid') patchJob(jobId, (x) => ({ fee: { ...x.fee!, status: 'refunded' } }));
            const q = Esc.quoteCancellation(j, party, Date.now());
            const { escrow, record } = Esc.applyCancellation(j, party, reason, Date.now());
            patchJob(jobId, (x) => ({ status: 'cancelled', escrow, cancellation: record, timeline: timeline(x, `Cancelled by ${party}: ${reason}`, party) }));
            if (record.artisanCompensation > 0) {
              set((s) => ({ ledger: [{ id: uid('led'), artisanId: j.artisanId, jobId, type: 'cancellation_fee', amount: record.artisanCompensation, at: nowIso(), note: `Late cancellation: ${j.title}` }, ...s.ledger] }));
            }
            if (q.trustPenalty) patchArtisan(j.artisanId, (a) => ({ stats: { ...a.stats, cancelledByArtisan: a.stats.cancelledByArtisan + 1 } }));
            sys(jobId, `Job cancelled by the ${party}. ${record.refundAmount ? `${naira(record.refundAmount)} refunded to the customer.` : 'No payment was taken.'}`);
            notify(party === 'customer' ? j.artisanId : j.customerId, 'Job cancelled', `“${j.title}” was cancelled.`, `/job/${jobId}`);
            return ok(undefined);
          } catch (e) {
            return fail((e as Error).message);
          }
        },

        submitReview: (jobId, rating, comment) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can review.');
          if (j.status !== 'completed' && j.status !== 'resolved') return fail('You can review once the job is complete.');
          if (j.reviewId) return fail('You have already reviewed this job.');
          if (rating < 1 || rating > 5) return fail('Choose a rating from 1 to 5.');
          const m = moderateMessage(comment);
          if (!m.allowed) return fail(m.warning!);
          const customer = get().customers.find((c) => c.id === j.customerId)!;
          const r: Review = { id: uid('rev'), jobId, artisanId: j.artisanId, customerName: customer.name.split(' ')[0] + ' ' + (customer.name.split(' ')[1]?.[0] ?? '') + '.', rating, comment: comment.trim(), categoryId: j.categoryId, at: nowIso() };
          set((s) => ({ reviews: [r, ...s.reviews] }));
          patchJob(jobId, () => ({ reviewId: r.id }));
          patchArtisan(j.artisanId, (a) => ({ stats: { ...a.stats, ratingSum: a.stats.ratingSum + rating, ratingCount: a.stats.ratingCount + 1 } }));
          notify(j.artisanId, 'New review', `${rating}★ — “${comment.slice(0, 60)}”`, `/artisan/${j.artisanId}`);
          return ok(undefined);
        },

        openDispute: (jobId, reason, details, evidence) => {
          if (isOffline()) return fail(OFFLINE_ACTION);
          const j = job(jobId);
          const party = j && myParty(j);
          if (!j || !party) return fail('Job not found.');
          if (!Esc.canDispute(j)) return fail('Disputes can be opened while money is held in Sleek Hold.');
          if (details.trim().length < 15) return fail('Please describe the problem in a few sentences (at least 15 characters).');
          const dm = moderateMessage(details);
          if (!dm.allowed) return fail(dm.warning!);
          const id = uid('dsp');
          const d: Dispute = { id, jobId, openedBy: party, reason, details: details.trim(), evidence, status: 'open', openedAt: nowIso() };
          set((s) => ({ disputes: [d, ...s.disputes] }));
          patchJob(jobId, (x) => ({ status: 'disputed', disputeId: id, escrow: { ...x.escrow, state: 'frozen' }, timeline: timeline(x, `Dispute opened by ${party}`, party) }));
          if (party === 'customer') patchArtisan(j.artisanId, (a) => ({ stats: { ...a.stats, disputesOpened: a.stats.disputesOpened + 1 } }));
          sys(jobId, 'A dispute has been opened. The money stays in Sleek Hold until Sleek reviews the chat history and proof of work. This usually takes 1–3 working days.');
          notify(party === 'customer' ? j.artisanId : j.customerId, 'Dispute opened', `A dispute was opened on “${j.title}”. Add your side of the story.`, `/dispute/${jobId}`);
          return ok(id);
        },

        respondDispute: (disputeId, text) => {
          const m = moderateMessage(text);
          if (!m.allowed) return fail(m.warning!);
          set((s) => ({ disputes: s.disputes.map((d) => (d.id === disputeId ? { ...d, artisanResponse: text.trim() } : d)) }));
          return ok(undefined);
        },

        tick: (now = Date.now()) => {
          for (const j of get().jobs) if (Esc.dueForAutoRelease(j, now)) releaseToArtisan(j, 'auto_release');
          for (const j of get().jobs)
            if (feeExpired(j, now)) {
              refundFee(j.id, 'no response in 24 hours');
              patchJob(j.id, (x) => ({ status: 'cancelled', timeline: timeline(x, 'Request expired: the artisan didn’t respond', 'system') }));
            }
          // Scheduled payouts (server-side cron in production).
          for (const a of get().artisans) {
            const sched = a.payoutSchedule ?? DEFAULT_SCHEDULE;
            const due = a.payoutAccount?.verified ? autoPayoutDue(sched, balanceOf(get().ledger, a.id), now) : 0;
            if (due > 0) {
              const at = new Date(now).toISOString();
              set((s) => ({
                payouts: [{ id: uid('po'), artisanId: a.id, amount: due, status: 'processing', requestedAt: at }, ...s.payouts],
                ledger: [{ id: uid('led'), artisanId: a.id, type: 'payout', amount: -due, at, note: `Scheduled payout to ${a.payoutAccount!.bankName} ••${a.payoutAccount!.accountNumberLast4}` }, ...s.ledger],
              }));
              patchArtisan(a.id, () => ({ payoutSchedule: { ...sched, lastAutoPayoutAt: at } }));
              notify(a.id, 'Scheduled payout sent', `${naira(due)} is on its way to your bank.`, '/earnings', 'payments');
            }
          }
          // Progress service orders (server-driven in production).
          const steps: Order['status'][] = ['placed', 'confirmed', 'dispatched', 'delivered'];
          const before = get().orders;
          set((s) => ({
            orders: s.orders.map((o) => {
              const idx = steps.indexOf(o.status);
              if (idx < 0 || idx === steps.length - 1) return o;
              const elapsed = now - new Date(o.placedAt).getTime();
              const target = Math.min(steps.length - 1, Math.floor(elapsed / 90_000));
              if (target <= idx) return o;
              const labels: Record<Order['status'], string> = { placed: 'Order placed', confirmed: `Seller confirmed. ${o.rider?.name ?? 'A Sleek rider'} is heading to pick it up`, dispatched: `${o.rider?.name ?? 'Rider'} picked up your order and is on the way`, delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled' };
              const newTimeline = [...o.timeline];
              for (let k = idx + 1; k <= target; k++) newTimeline.push({ at: new Date().toISOString(), label: labels[steps[k]] });
              return { ...o, status: steps[target], timeline: newTimeline };
            }),
          }));
          for (const o of get().orders) {
            const prev = before.find((x) => x.id === o.id);
            if (prev && prev.status !== o.status && (o.status === 'dispatched' || o.status === 'delivered')) {
              notify(o.userId, o.status === 'dispatched' ? 'Your rider is on the way' : 'Order delivered', o.status === 'dispatched' ? `${o.rider?.name ?? 'Your Sleek rider'} picked up order #${o.id.slice(-6).toUpperCase()}.` : `Order #${o.id.slice(-6).toUpperCase()} was delivered.`, `/orders/${o.id}`, 'payments');
            }
          }
        },

        // ---- artisan -------------------------------------------------------
        setOnline: (online) => {
          const id = me().userId!;
          const a = artisanById(id);
          if (!a) return fail('Not an artisan account.');
          if (online && a.suspended) return fail(SUSPENDED);
          if (online && a.identity.postReview === 'revoked') return fail('Your verification was revoked by the Trust team. Open Help to talk to Support.');
          if (online && a.identity.faceMatch !== 'passed') return fail('Complete identity verification before going online.');
          const hasSkill = a.skills.some((s) => s.status === 'approved') || a.workers.some((w) => w.skills.some((s) => s.status === 'approved'));
          if (online && !hasSkill) return fail('Get at least one skill verified before going online.');
          patchArtisan(id, () => ({ online }));
          return ok(undefined);
        },
        setWorkingHours: (dayIdx, hours) => patchArtisan(me().userId!, (a) => ({ workingHours: { ...a.workingHours, [dayIdx]: hours } })),
        updateArtisanProfile: (p) => {
          if (p.bio) {
            const m = moderateMessage(p.bio);
            if (!m.allowed) return; // contact details can't be smuggled into bios either
          }
          patchArtisan(me().userId!, () => p);
        },

        verifyNIN: async (nin, name, workerId) => {
          const owner = identityOwner(workerId);
          if (!owner) return fail('Sign in to an artisan or seller account first.');
          if ((owner.identity.failedAttempts ?? 0) >= MAX_VERIFICATION_FAILURES) return fail('Verification is locked after 3 failed attempts. Our Trust team will review it and email you within 24 hours.');
          const clean = nin.replace(/\s/g, '');
          const h = hashNIN(clean);
          const me0 = me().userId!;
          const ownKey = workerId ? `${me0}/${workerId}` : me0;
          const reused = allIdentities().find((x) => x.identity.ninHash === h && x.owner !== ownKey);
          const failWith = (msg: string) => {
            patchIdentity(workerId, (i) => ({ ...i, nin: 'failed', failedAttempts: (i.failedAttempts ?? 0) + 1 }));
            logProvider('identity', 'nin_lookup', `${providerInfo('identity').name}: NIN check failed (${msg.slice(0, 60)})`, false);
            return fail(msg);
          };
          if (reused) return failWith('This NIN is already linked to another Sleek account. One person can only have one account. Contact Support if this is a mistake.');
          if (!namesMatch(owner.name, name)) return failWith(`The name on the NIN must match the account name (${owner.name}). Fake or borrowed identities are not allowed.`);
          const res = await identityProvider.lookupNIN(clean, name);
          if (!res.ok) return failWith(res.error ?? 'NIN verification failed.');
          if (res.fullName && !namesMatch(owner.name, res.fullName)) return failWith('The name on the NIMC record does not match this account.');
          patchIdentity(workerId, (i) => ({ ...i, nin: 'passed', ninLast4: clean.slice(-4), ninHash: h, fullNameOnRecord: res.fullName }));
          logProvider('identity', 'nin_lookup', `${providerInfo('identity').name}: NIN ••••${clean.slice(-4)} found, name matches ${owner.name}`);
          return ok(undefined);
        },

        completeLiveness: async (frames, challenges, workerId) => {
          const owner = identityOwner(workerId);
          if (!owner) return fail('Sign in to an artisan or seller account first.');
          if (owner.identity.nin !== 'passed') return fail('Verify the NIN first.');
          const live = await identityProvider.checkLiveness({ frames, challenges });
          if (!live.passed) {
            patchIdentity(workerId, (i) => ({ ...i, liveness: 'failed', failedAttempts: (i.failedAttempts ?? 0) + 1 }));
            logProvider('identity', 'liveness', `${providerInfo('identity').name}: liveness failed`, false);
            return fail(live.reason ?? 'Liveness check failed.');
          }
          const match = await identityProvider.faceMatch({ selfieRef: live.selfieRef!, referenceRef: 'nimc' });
          const passed = match.score >= 0.85;
          patchIdentity(workerId, (i) => ({ ...i, liveness: 'passed', faceMatch: passed ? 'passed' : 'failed', faceMatchScore: match.score, verifiedAt: passed ? nowIso() : undefined, postReview: passed ? 'pending' : i.postReview, failedAttempts: passed ? i.failedAttempts : (i.failedAttempts ?? 0) + 1 }));
          logProvider('identity', 'face_match', `${providerInfo('identity').name}: liveness ${Math.round(live.score * 100)}%, face match ${Math.round(match.score * 100)}%, no duplicate faces found`, passed);
          const id = me().userId!;
          if (passed && owner.kind === 'seller') {
            notify(id, 'Identity verified', 'Next: your guarantor and business registration.', '/verify', 'verification');
          } else if (passed) {
            notify(id, 'Identity verified', workerId ? 'Your worker’s identity is verified.' : 'You now have the Identity Verified badge. Next: record a video for your first skill.', '/verify');
            if (!workerId) sendEmail(owner.email, 'Identity verified', `Hi ${owner.name.split(' ')[0]}, your NIN, liveness and face match passed. Next, record a short video of your work for each skill. Each approved skill goes live straight away.`, id);
          }
          return passed ? ok(undefined) : fail('Your face did not match your NIN record photo. Try again in good light, or contact support.');
        },

        submitSkillVideo: async ({ categoryId, uri, durationSec, workerId }) => {
          const id = me().userId!;
          const a = artisanById(id);
          if (!a) return fail('Artisan accounts only.');
          const ident = workerId ? a.workers.find((w) => w.id === workerId)?.identity : a.identity;
          if (!ident || ident.faceMatch !== 'passed') return fail('Finish identity verification first.');
          if (ident.postReview === 'revoked') return fail('Your identity verification was revoked by the Trust team. Open Help to talk to Support.');
          const recordedAt = nowIso();
          const analysis = await identityProvider.analyseSkillVideo({ uri, durationSec, identityRef: id });
          const video = { id: uid('vid'), uri, durationSec, recordedInApp: true as const, livenessPassed: analysis.livenessPassed, faceMatchScore: analysis.faceMatchScore, recordedAt, captureHash: captureHash(uri, recordedAt) };
          const reusedVideo = get().artisans.some((x) => [...x.skills, ...x.workers.flatMap((w) => w.skills)].some((k) => k.video?.captureHash === video.captureHash && k.video.id !== video.id));
          const check = checkSkillVideo(video);
          if (reusedVideo) check.problems.push('This video was already used for another skill or account.');
          check.ok = check.problems.length === 0;
          const cat = category(categoryId);
          const status = statusAfterAutoCheck(cat, check);
          logProvider('storage', 'upload', `${providerInfo('storage').name}: skill video stored privately (${durationSec}s)`);
          logProvider('identity', 'video_check', `${providerInfo('identity').name}: skill video liveness ${analysis.livenessPassed ? 'passed' : 'failed'}, face match ${Math.round(analysis.faceMatchScore * 100)}%`, check.ok);
          const entry: SkillVerification = {
            categoryId,
            status,
            video,
            submittedAt: recordedAt,
            decidedAt: check.ok ? recordedAt : undefined,
            reviewerNote: check.ok ? undefined : check.problems.join(' '),
            certificateRequired: cat.risk === 'high',
            postReview: check.ok ? 'pending' : undefined,
          };
          const upsert = (skills: SkillVerification[]) => [...skills.filter((s) => s.categoryId !== categoryId), entry];
          if (workerId) patchArtisan(id, (x) => ({ workers: x.workers.map((w) => (w.id === workerId ? { ...w, skills: upsert(w.skills) } : w)) }));
          else patchArtisan(id, (x) => ({ skills: upsert(x.skills) }));
          if (check.ok) {
            const firstSkill = ![...a.skills, ...a.workers.flatMap((w) => w.skills)].some((k) => k.status === 'approved');
            notify(id, `${cat.name} verified`, firstSkill ? 'Your dashboard is live. Go online to start receiving jobs.' : `You can now take ${cat.name} jobs.`, '/dashboard', 'verification');
            sendEmail(a.email, `You’re verified for ${cat.name}`, `Hi ${a.name.split(' ')[0]}, your ${cat.name} video passed our checks. ${firstSkill ? 'Your dashboard is now live and you can accept bookings. ' : ''}Our Trust team reviews every new skill and will email you if they need anything else.`, id);
            for (const adm of adminIds()) notify(adm, 'New skill to audit', `${a.businessName ?? a.name} — ${cat.name}${cat.risk === 'high' ? ' (high-risk)' : ''}`, undefined, 'verification');
          }
          return check.ok ? ok(status) : fail(check.problems.join(' '));
        },

        addWorker: (name) => {
          const id = me().userId!;
          const a = artisanById(id);
          if (!a || a.accountType === 'individual') return fail('Only Team and Agency accounts can add workers.');
          if (name.trim().length < 3) return fail('Enter the worker’s full name.');
          if (!moderateMessage(name).allowed) return fail('A name can’t include phone numbers, emails or links.');
          const w: Worker = { id: uid('wk'), name: name.trim(), identity: emptyIdentity(), skills: [], active: true, avatarColor: '#0284C7' };
          patchArtisan(id, (x) => ({ workers: [...x.workers, w] }));
          return ok(w.id);
        },
        setWorkerActive: (workerId, active) => patchArtisan(me().userId!, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, active } : w)) })),
        setPayoutAccount: (acct) => patchArtisan(me().userId!, () => ({ payoutAccount: acct })),
        requestPayout: async (amount) => {
          const id = me().userId!;
          const a = artisanById(id)!;
          if (!a.payoutAccount?.verified) return fail('Add and verify a payout bank account first.');
          const balance = get().ledger.filter((l) => l.artisanId === id).reduce((sum, l) => sum + l.amount, 0);
          if (amount > balance) return fail(`You can withdraw up to ${naira(balance)}.`);
          if (isOffline()) return fail(OFFLINE);
          const res = await payments.requestPayout({ artisanId: id, amount });
          if (!res.ok) return fail(res.error!);
          const at = nowIso();
          set((s) => ({
            payouts: [{ id: uid('po'), artisanId: id, amount, status: 'processing', requestedAt: at }, ...s.payouts],
            ledger: [{ id: uid('led'), artisanId: id, type: 'payout', amount: -amount, at, note: `Payout to ${a.payoutAccount!.bankName} ••${a.payoutAccount!.accountNumberLast4}` }, ...s.ledger],
          }));
          notify(id, 'Payout on the way', `${naira(amount)} is being sent to your bank. It usually arrives within minutes.`, '/earnings');
          return ok(undefined);
        },

        // ---- admin ---------------------------------------------------------
        reviewSkill: ({ artisanId, workerId, categoryId, decision, quality, note }) => {
          if (!adminActor) return fail('Only Sleek staff can do this, from the admin console.');
          const cat = category(categoryId);
          const decide = (skills: SkillVerification[]) =>
            skills.map((s) => (s.categoryId === categoryId ? { ...s, status: decision, qualityScore: decision === 'approved' ? quality ?? 4 : undefined, reviewerNote: note, decidedAt: nowIso(), certificateProvided: s.certificateRequired ? decision === 'approved' : undefined } : s));
          if (workerId) patchArtisan(artisanId, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, skills: decide(w.skills) } : w)) }));
          else patchArtisan(artisanId, (a) => ({ skills: decide(a.skills) }));
          const msg = { approved: `You are now verified for ${cat.name}.`, rejected: `Your ${cat.name} video was not approved. ${note}`, needs_more: `We need another ${cat.name} video. ${note}` }[decision];
          notify(artisanId, decision === 'approved' ? 'Skill verified' : 'Skill review update', msg, '/verify');
          return ok(undefined);
        },
        startDisputeReview: (disputeId) => set((s) => ({ disputes: s.disputes.map((d) => (d.id === disputeId && d.status === 'open' ? { ...d, status: 'under_review' } : d)) })),
        resolveDispute: (disputeId, outcome, artisanShare, note) => {
          if (!adminActor) return fail('Only Sleek staff can do this, from the admin console.');
          const d = get().disputes.find((x) => x.id === disputeId);
          const j = d && job(d.jobId);
          if (!d || !j) return fail('Dispute not found.');
          if (d.status === 'resolved') return fail('Already resolved.');
          if (note.trim().length < 10) return fail('Add a short explanation for both parties.');
          const a = artisanById(j.artisanId)!;
          const share = outcome === 'release_to_artisan' ? 1 : outcome === 'refund_customer' ? 0 : artisanShare;
          const escrow = Esc.resolveDisputeEscrow(j.escrow, share, isTrusted(a, Date.now()), nowIso(), rate());
          set((s) => ({ disputes: s.disputes.map((x) => (x.id === disputeId ? { ...x, status: 'resolved', resolution: { outcome, artisanShare: share, note: note.trim(), by: adminActor!.name, at: nowIso() } } : x)) }));
          patchJob(j.id, (x) => ({ status: 'resolved', escrow, timeline: timeline(x, 'Dispute resolved by Sleek', 'admin') }));
          if (escrow.releasedToArtisan) set((s) => ({ ledger: [{ id: uid('led'), artisanId: a.id, jobId: j.id, type: 'escrow_release', amount: escrow.releasedToArtisan!, at: nowIso(), note: `Dispute resolution: ${j.title}` }, ...s.ledger] }));
          if (share < 0.5) patchArtisan(a.id, (x) => ({ stats: { ...x.stats, disputesLost: x.stats.disputesLost + 1 } }));
          else patchArtisan(a.id, (x) => ({ stats: { ...x.stats, completedJobs: x.stats.completedJobs + 1 } }));
          sys(j.id, `Dispute resolved by Sleek. Artisan receives ${naira(escrow.releasedToArtisan ?? 0)}; customer refunded ${naira(escrow.refundedToCustomer ?? 0)}. Note: ${note.trim()}`);
          notify(j.customerId, 'Dispute resolved', `Decision on “${j.title}”: ${note.trim().slice(0, 80)}`, `/dispute/${j.id}`);
          notify(a.id, 'Dispute resolved', `Decision on “${j.title}”: ${note.trim().slice(0, 80)}`, `/dispute/${j.id}`);
          return ok(undefined);
        },
        markViolationReviewed: (id) => set((s) => ({ violations: s.violations.map((v) => (v.id === id ? { ...v, reviewed: true } : v)) })),

        // ---- services ------------------------------------------------------
        addToCart: (line) =>
          set((s) => {
            const existing = s.cart.find((l) => l.itemId === line.itemId);
            if (existing) return { cart: s.cart.map((l) => (l.itemId === line.itemId ? { ...l, ...line, qty: line.qty } : l)) };
            return { cart: [...s.cart, line] };
          }),
        updateCartLine: (itemId, p) => set((s) => ({ cart: s.cart.map((l) => (l.itemId === itemId ? { ...l, ...p } : l)) })),
        removeFromCart: (itemId) => set((s) => ({ cart: s.cart.filter((l) => l.itemId !== itemId) })),
        placeOrder: async ({ deliverTo, jobId, address, method }) => {
          const userId = me().userId;
          if (!userId) return fail('Sign in first.');
          const lines = get().cart;
          if (!lines.length) return fail('Your cart is empty.');
          if (deliverTo === 'artisan') {
            const j = jobId && job(jobId);
            if (!j || !Esc.isLocationDisclosed(j)) return fail('Delivery to an artisan needs a funded job so we know where they will be.');
          }
          if (!address.trim()) return fail('Add a delivery address.');
          if (isSuspended(userId)) return fail(SUSPENDED);
          const unavailable = lines.find((l) => { const it = get().products.find((x) => x.id === l.itemId); return !it || it.status === 'unlisted' || sellerById(it.sellerId ?? '')?.suspended; });
          if (unavailable) return fail('Something in your cart is no longer available. Remove it and try again.');
          const totals = cartTotals(lines, get().products, get().platformConfig?.deliveryFee);
          const id = uid('ord');
          if (isOffline()) return fail(OFFLINE);
          const res = await payments.payOrder({ orderId: id, amount: totals.total, method });
          logProvider('payments', 'charge', `${providerInfo('payments').name}: ${method} payment of ${naira(totals.total)} for order #${id.slice(-6).toUpperCase()} ${res.ok ? 'succeeded' : 'failed'}`, res.ok);
          if (!res.ok) return fail(res.error!);
          const at = nowIso();
          const rider = RIDERS[get().orders.length % RIDERS.length];
          const o: Order = { id, userId, lines, subtotal: totals.subtotal, deposit: totals.deposit, deliveryFee: totals.deliveryFee, total: totals.total, deliverTo, deliveryAddress: address, jobId, status: 'placed', placedAt: at, timeline: [{ at, label: 'Order placed and paid' }], eta: new Date(Date.now() + 3 * 3_600_000).toISOString(), rider };
          set((s) => ({ orders: [o, ...s.orders], cart: [], products: s.products.map((p) => { const l = lines.find((x) => x.itemId === p.id); return l && p.kind === 'product' ? { ...p, stock: Math.max(0, p.stock - l.qty) } : p; }) }));
          logProvider('maps', 'route', `${providerInfo('maps').name}: delivery route planned to ${address.slice(0, 40)}`);
          notify(userId, 'Order placed', `Order #${id.slice(-6).toUpperCase()} — ${naira(totals.total)}. Track your Sleek rider on the order page.`, `/orders/${id}`);
          for (const sid of [...new Set(lines.map((l) => get().products.find((x) => x.id === l.itemId)?.sellerId).filter(Boolean))] as ID[]) {
            notify(sid, 'New order 🎉', `Order #${id.slice(-6).toUpperCase()}. Confirm and pack it for the Sleek rider.`, `/seller`, 'payments');
          }
          if (deliverTo === 'artisan' && jobId) {
            const j = job(jobId)!;
            notify(j.artisanId, 'Materials on the way', `The customer ordered materials for “${j.title}”, delivered to you.`, `/orders/${id}`);
            sys(jobId, 'The customer ordered materials from Sleek Services for this job. Delivery goes to the artisan.');
          }
          return ok(id);
        },

        // ---- notifications ------------------------------------------------
        markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.userId === s.session.userId ? { ...n, read: true } : n)) })),

        // ---- onboarding: guarantor, business registration, activation ----------
        setGuarantor: (g) => {
          const id = me().userId ?? '';
          const owner = artisanById(id) ?? sellerById(id);
          if (!owner) return fail('Only professional accounts need a guarantor.');
          if (g.name.trim().split(/\s+/).length < 2) return fail('Enter the guarantor’s full name.');
          const d = g.phone.replace(/\D/g, '');
          if (!/^(0[789][01]\d{8}|234[789][01]\d{8})$/.test(d)) return fail('Enter the guarantor’s Nigerian mobile number.');
          if (d.slice(-10) === owner.phone.replace(/\D/g, '').slice(-10)) return fail('Your guarantor can’t use your own phone number.');
          if (namesMatch(owner.name, g.name)) return fail('You can’t be your own guarantor.');
          if (g.relationship.trim().length < 3 || g.occupation.trim().length < 3) return fail('Add how you know them and what they do.');
          const usedBy = [...get().artisans, ...get().sellers].find((x) => x.id !== id && x.guarantor?.phone.replace(/\D/g, '').slice(-10) === d.slice(-10));
          if (usedBy) return fail('This person already guarantees another Sleek account. Choose someone else.');
          const guarantor = { name: g.name.trim(), phone: g.phone.trim(), relationship: g.relationship.trim(), occupation: g.occupation.trim(), status: 'pending' as const };
          if (artisanById(id)) patchArtisan(id, () => ({ guarantor }));
          else set((st) => ({ sellers: st.sellers.map((x) => (x.id === id ? { ...x, guarantor } : x)) }));
          const code = demoCode(`guar:${id}:${d}`);
          logProvider('sms', 'guarantor', `${providerInfo('sms').name}: guarantor confirmation SMS sent to •••• ${d.slice(-4)}`);
          return ok(code);
        },
        confirmGuarantor: (code) => {
          const id = me().userId ?? '';
          const owner = artisanById(id) ?? sellerById(id);
          if (!owner?.guarantor) return fail('Add a guarantor first.');
          if (code.trim() !== demoCode(`guar:${id}:${owner.guarantor.phone.replace(/\D/g, '')}`)) return fail('That code is not correct. Ask your guarantor for the code we texted them.');
          const guarantor = { ...owner.guarantor, status: 'confirmed' as const, confirmedAt: nowIso() };
          if (artisanById(id)) patchArtisan(id, () => ({ guarantor }));
          else set((st) => ({ sellers: st.sellers.map((x) => (x.id === id ? { ...x, guarantor } : x)) }));
          return ok(undefined);
        },
        setBusinessRegistration: ({ cacNumber, notRegistered, serviceAreas, teamSize }) => {
          const id = me().userId ?? '';
          const cac = (cacNumber ?? '').trim();
          if (!notRegistered && !/^(RC|BN)?\s?\d{5,8}$/i.test(cac)) return fail('Enter a valid CAC number (e.g. RC 1234567), or tick “Not registered yet”.');
          const sel = sellerById(id);
          if (sel) {
            set((st) => ({ sellers: st.sellers.map((x) => (x.id === id ? { ...x, cacNumber: notRegistered ? undefined : cac.toUpperCase(), cacPending: notRegistered } : x)) }));
            if (!notRegistered) logProvider('identity', 'cac_lookup', `CAC search (simulated): ${cac.toUpperCase()} found, name matches ${sel.businessName}`);
            return ok(undefined);
          }
          const a = artisanById(id);
          if (!a || a.accountType === 'individual') return fail('Team, agency and seller accounts only.');
          patchArtisan(id, (x) => ({ business: { serviceAreas: serviceAreas?.length ? serviceAreas : x.business?.serviceAreas ?? [x.area], teamSize: teamSize ?? x.business?.teamSize ?? 1, cacNumber: notRegistered ? undefined : cac.toUpperCase(), cacPending: notRegistered, completedOnboarding: true } }));
          if (!notRegistered) logProvider('identity', 'cac_lookup', `CAC search (simulated): ${cac.toUpperCase()} found, name matches ${a.businessName ?? a.name}`);
          return ok(undefined);
        },
        activateAccount: () => {
          const id = me().userId ?? '';
          const a = artisanById(id);
          const sel = sellerById(id);
          if (!a && !sel) return fail('Nothing to activate.');
          const steps = a ? artisanSteps(a) : sellerSteps(sel!);
          if (!allDone(steps)) return fail(`Still to do: ${steps.filter((x) => !x.done).map((x) => x.label.toLowerCase()).join(', ')}.`);
          const at = nowIso();
          if (a) patchArtisan(id, () => ({ activatedAt: at }));
          else set((st) => ({ sellers: st.sellers.map((x) => (x.id === id ? { ...x, activatedAt: at, storeLive: true } : x)) }));
          const email = a?.email ?? sel?.email;
          sendEmail(email, a ? 'Your Sleek account is verified and open' : 'Your Sleek Services store is verified and open', `Hi ${(a?.name ?? sel!.name).split(' ')[0]}, every check passed: identity, guarantor${(a && a.accountType !== 'individual') || sel ? ', business registration' : ''}${a ? ' and your skill video' : ''}. Your ${a ? 'dashboard' : 'store'} is now open. Our Trust team audits every new account and will email you if anything else is needed.`, id);
          notify(id, a ? 'Your account is open' : 'Your store is open', a ? 'Go online to start receiving jobs.' : 'Add products and start selling.', a ? '/dashboard' : '/seller', 'verification');
          return ok(undefined);
        },

        // ---- upfront fees ----------------------------------------------------
        setArtisanFee: (categoryId, fee) => {
          const a = artisanById(me().userId ?? '');
          if (!a) return fail('Artisan accounts only.');
          const err = validateFee(fee);
          if (err) return fail(err);
          patchArtisan(a.id, (x) => ({ fees: { ...x.fees, [categoryId]: { type: fee.type, amount: Math.round(fee.amount) } } }));
          return ok(undefined);
        },
        setJobFee: (jobId, fee) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can set the fee.');
          if (!feeEditable(j)) return fail('The fee is already paid, so it can’t change now.');
          const err = validateFee(fee);
          if (err) return fail(err);
          patchJob(jobId, (x) => ({ fee: { ...x.fee!, type: fee.type, amount: Math.round(fee.amount) }, timeline: timeline(x, `Artisan set a ${naira(Math.round(fee.amount))} ${FEE_LABEL[fee.type].toLowerCase()}`, 'artisan') }));
          sys(jobId, `The artisan set a ${naira(Math.round(fee.amount))} ${FEE_LABEL[fee.type].toLowerCase()} for this job. It’s paid before the artisan engages and waits in Sleek Hold.`);
          notify(j.customerId, 'Fee updated', `${FEE_LABEL[fee.type]}: ${naira(Math.round(fee.amount))} for “${j.title}”.`, `/fee/${jobId}`, 'payments');
          return ok(undefined);
        },
        payFee: async (jobId, method) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can pay this fee.');
          if (!j.fee || j.fee.status !== 'unpaid') return fail('This fee is already paid.');
          if (j.status !== 'requested') return fail('This request is closed.');
          if (isOffline()) return fail(OFFLINE);
          const res = await payments.payOrder({ orderId: `fee_${jobId}`, amount: j.fee.amount, method });
          logProvider('payments', 'charge', `${providerInfo('payments').name}: ${method} payment of ${naira(j.fee.amount)} ${FEE_LABEL[j.fee.type].toLowerCase()} ${res.ok ? 'held in Sleek Hold' : 'failed'}`, res.ok);
          if (!res.ok) return fail(res.error ?? 'Payment failed. You have not been charged.');
          const at = nowIso();
          patchJob(jobId, (x) => ({ fee: { ...x.fee!, status: 'held', paidAt: at, reference: res.reference }, timeline: timeline(x, `${FEE_LABEL[x.fee!.type]} of ${naira(x.fee!.amount)} paid into Sleek Hold`, 'customer') }));
          const cust = get().customers.find((c) => c.id === j.customerId);
          sys(jobId, `${FEE_LABEL[j.fee.type]} paid: ${naira(j.fee.amount)} is in Sleek Hold. ${j.fee.type === 'inspection' ? 'It goes to the artisan after the inspection.' : 'It goes to the artisan when they respond with a price.'} Chat is open.`);
          notify(j.artisanId, j.origin === 'match' ? 'You accepted a matched job' : 'New job request', `${cust?.name ?? 'A customer'} needs ${categoryName(j.categoryId)} — ${j.title}. ${FEE_LABEL[j.fee.type]} paid.`, `/chat/${jobId}`);
          const fresh = job(jobId)!;
          if (fresh.pricePool.offers.some((o) => o.by === 'artisan') && releasesOn(fresh.fee!, 'engaged')) releaseFee(jobId, 'artisan already sent a price');
          return ok(undefined);
        },
        markInspected: (jobId) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'artisan') return fail('Only the artisan can do this.');
          if (!j.fee || j.fee.type !== 'inspection' || j.fee.status !== 'held') return fail('There’s no inspection fee waiting for this job.');
          patchJob(jobId, (x) => ({ inspectedAt: nowIso(), timeline: timeline(x, 'Artisan completed the inspection', 'artisan') }));
          sys(jobId, 'The artisan has inspected the problem. Next: agree the price for the work in the Price Pool.');
          releaseFee(jobId, 'inspection done');
          notify(j.customerId, 'Inspection done', `Your artisan inspected “${j.title}”. Agree the price for the work next.`, `/chat/${jobId}`, 'job_progress');
          return ok(undefined);
        },
        verifyCustomer: async (nin, name) => {
          const c = get().customers.find((x) => x.id === me().userId);
          if (!c) return fail('Customer accounts only.');
          const clean = nin.replace(/\s/g, '');
          if (!/^\d{11}$/.test(clean)) return fail('Your NIN has 11 digits. Dial *346# to get it.');
          if ((c.identity?.failedAttempts ?? 0) >= MAX_VERIFICATION_FAILURES) return fail('Verification is locked after 3 failed attempts. Talk to Support to finish it.');
          const h = hashNIN(clean);
          const used = get().customers.some((x) => x.id !== c.id && x.identity?.ninHash === h);
          const failC = (msg: string) => {
            set((st) => ({ customers: st.customers.map((x) => (x.id === c.id ? { ...x, identity: { ...(x.identity ?? emptyIdentity()), nin: 'failed', failedAttempts: (x.identity?.failedAttempts ?? 0) + 1 } } : x)) }));
            logProvider('identity', 'nin_lookup', `${providerInfo('identity').name}: customer NIN check failed`, false);
            return fail(msg);
          };
          if (used) return failC('This NIN is already linked to another Sleek customer account. One person, one account.');
          if (!namesMatch(c.name, name)) return failC(`The name on the NIN must match your account name (${c.name}).`);
          const r = await identityProvider.lookupNIN(clean, name);
          if (!r.ok) return failC(r.error ?? 'NIN check failed.');
          set((st) => ({ customers: st.customers.map((x) => (x.id === c.id ? { ...x, identity: { ...(x.identity ?? emptyIdentity()), nin: 'passed', ninLast4: clean.slice(-4), ninHash: h, fullNameOnRecord: r.fullName, verifiedAt: nowIso() } } : x)) }));
          logProvider('identity', 'nin_lookup', `${providerInfo('identity').name}: customer NIN ••••${clean.slice(-4)} verified, name matches`);
          notify(c.id, 'Account verified', 'You can now book verified artisans on Sleek.', '/home', 'system');
          return ok(undefined);
        },

        // ---- support ---------------------------------------------------------
        openTicket: ({ subject, category: cat, text, jobId, orderId }) => {
          const s0 = me();
          if (!s0.userId || s0.role === 'admin') return fail('Sign in first.');
          if (subject.trim().length < 4) return fail('Add a short subject.');
          if (text.trim().length < 10) return fail('Tell us a bit more (at least 10 characters).');
          const at = nowIso();
          const t: SupportTicket = {
            id: uid('tk'),
            userId: s0.userId,
            userRole: s0.role as SupportTicket['userRole'],
            subject: subject.trim(),
            category: cat,
            jobId,
            orderId,
            status: 'open',
            priority: cat === 'safety' ? 'urgent' : cat === 'payment' ? 'high' : 'normal',
            messages: [
              { id: uid('tm'), from: 'user', text: text.trim(), at },
              { id: uid('tm'), from: 'system', text: `Ticket received. ${cat === 'safety' ? 'A safety agent is being alerted now.' : 'A Sleek Support agent usually replies within 15 minutes, 7am–10pm.'}`, at },
            ],
            createdAt: at,
            updatedAt: at,
          };
          set((st) => ({ tickets: [t, ...st.tickets] }));
          for (const adm of adminIds()) notify(adm, `New support ticket (${t.priority})`, `${nameOf(s0.userId)}: ${t.subject}`, undefined, 'system');
          // Demo: an agent picks it up shortly. In production a real agent replies from the admin console.
          setTimeout(() => {
            const cur = get().tickets.find((x) => x.id === t.id);
            if (!cur || cur.messages.some((m) => m.from === 'agent')) return;
            const reply = { id: uid('tm'), from: 'agent' as const, name: 'Zainab (Sleek Support)', text: `Hi ${nameOf(s0.userId!).split(' ')[0]}, thanks for reaching out. I’m looking into “${t.subject}” now${jobId || orderId ? ' and I can see the details' : ''}. I’ll update you here shortly.`, at: nowIso() };
            set((st) => ({ tickets: st.tickets.map((x) => (x.id === t.id ? { ...x, messages: [...x.messages, reply], assignedTo: 'Zainab (Sleek Support)', updatedAt: reply.at } : x)) }));
            notify(s0.userId!, 'Sleek Support replied', t.subject, `/support/${t.id}`, 'system');
          }, 4000);
          return ok(t.id);
        },
        replyTicket: (ticketId, text) => {
          const t = get().tickets.find((x) => x.id === ticketId);
          if (!t || t.userId !== me().userId) return fail('Ticket not found.');
          if (text.trim().length < 1) return fail('Write a message.');
          const at = nowIso();
          set((st) => ({ tickets: st.tickets.map((x) => (x.id === ticketId ? { ...x, status: 'open', updatedAt: at, messages: [...x.messages, { id: uid('tm'), from: 'user', text: text.trim(), at }] } : x)) }));
          return ok(undefined);
        },
        closeTicket: (ticketId) => {
          const t = get().tickets.find((x) => x.id === ticketId);
          if (!t || t.userId !== me().userId) return fail('Ticket not found.');
          set((st) => ({ tickets: st.tickets.map((x) => (x.id === ticketId ? { ...x, status: 'resolved', updatedAt: nowIso() } : x)) }));
          return ok(undefined);
        },

        // ---- sellers ---------------------------------------------------------
        addProduct: (p) => {
          const sel = sellerById(me().userId ?? '');
          if (!sel) return fail('Seller accounts only.');
          if (sel.suspended) return fail(SUSPENDED);
          if (!sel.storeLive) return fail('Verify your identity first. Your store opens as soon as it passes.');
          if (p.name.trim().length < 3) return fail('Give the product a clear name.');
          if (!(p.price >= 100)) return fail('Set a price of at least ₦100.');
          if (!(p.stock >= 1)) return fail('Stock must be at least 1.');
          const m = moderateMessage(`${p.name} ${p.description}`);
          if (!m.allowed) return fail('Listings can’t include phone numbers, emails, links or social handles.');
          const item: ServiceItem = { id: uid(p.kind === 'rental' ? 'r' : 'p'), kind: p.kind, name: p.name.trim(), group: p.group, icon: p.kind === 'rental' ? 'cube-outline' : 'pricetag-outline', price: Math.round(p.price), unit: p.unit.trim() || (p.kind === 'rental' ? 'day' : 'each'), description: p.description.trim(), vendor: sel.businessName, vendorArea: `${sel.area}, ${sel.city}`, stock: Math.round(p.stock), deposit: p.kind === 'rental' ? Math.round(p.deposit ?? 0) : undefined, relatedCategoryIds: [], sellerId: sel.id, status: 'live' };
          set((st) => ({ products: [item, ...st.products] }));
          logProvider('vision', 'scan', `${providerInfo('vision').name}: listing photo scanned, no contact details`);
          return ok(item.id);
        },
        updateProduct: (id, p) => {
          const sel = sellerById(me().userId ?? '');
          const it = get().products.find((x) => x.id === id);
          if (!sel || !it || it.sellerId !== sel.id) return fail('Product not found.');
          if (p.description && !moderateMessage(p.description).allowed) return fail('Listings can’t include contact details.');
          set((st) => ({ products: st.products.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
          return ok(undefined);
        },
        sellerConfirmOrder: (orderId) => {
          const sel = sellerById(me().userId ?? '');
          const o = get().orders.find((x) => x.id === orderId);
          if (!sel || !o) return fail('Order not found.');
          if (o.status !== 'placed') return fail('This order is already confirmed.');
          set((st) => ({ orders: st.orders.map((x) => (x.id === orderId ? { ...x, status: 'confirmed', timeline: [...x.timeline, { at: nowIso(), label: `${sel.businessName} confirmed and packed your order. ${x.rider?.name ?? 'A Sleek rider'} is coming to pick it up` }] } : x)) }));
          notify(o.userId, 'Order confirmed', `${sel.businessName} packed order #${orderId.slice(-6).toUpperCase()}.`, `/orders/${orderId}`, 'payments');
          return ok(undefined);
        },
        setSellerPayoutAccount: (acct) => set((st) => ({ sellers: st.sellers.map((x) => (x.id === st.session.userId ? { ...x, payoutAccount: acct } : x)) })),

        logProvider: (provider, action, summary, okFlag = true) => logProvider(provider, action, summary, okFlag),

        // ---- admin console -----------------------------------------------------
        adminSetSuspended: (userId, suspended, reason) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          if (suspended && reason.trim().length < 5) return fail('Give a reason (at least 5 characters).');
          const why = suspended ? reason.trim() : undefined;
          const found = !!(get().customers.find((c) => c.id === userId) || artisanById(userId) || sellerById(userId));
          if (!found) return fail('User not found.');
          set((st) => ({
            customers: st.customers.map((c) => (c.id === userId ? { ...c, suspended, suspendedReason: why } : c)),
            artisans: st.artisans.map((a) => (a.id === userId ? { ...a, suspended, suspendedReason: why, online: suspended ? false : a.online } : a)),
            sellers: st.sellers.map((x) => (x.id === userId ? { ...x, suspended, suspendedReason: why } : x)),
          }));
          notify(userId, suspended ? 'Account suspended' : 'Account restored', suspended ? `Reason: ${why}. Open Help to talk to Support.` : 'Your Sleek account is active again.', '/help', 'system');
          return ok(undefined);
        },
        adminSetIdentityReview: (userId, review, reason, workerId) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const sel = sellerById(userId);
          const a = artisanById(userId);
          if (!sel && !a) return fail('User not found.');
          const upd = (i: IdentityVerification) => ({ ...i, postReview: review });
          if (sel) set((st) => ({ sellers: st.sellers.map((x) => (x.id === userId ? { ...x, identity: upd(x.identity), storeLive: review === 'revoked' ? false : x.identity.faceMatch === 'passed' } : x)) }));
          else if (workerId) patchArtisan(userId, (x) => ({ workers: x.workers.map((w) => (w.id === workerId ? { ...w, identity: upd(w.identity) } : w)) }));
          else patchArtisan(userId, (x) => ({ identity: upd(x.identity), online: review === 'revoked' ? false : x.online }));
          const email = sel?.email ?? a?.email;
          if (review === 'confirmed') sendEmail(email, 'Your Sleek verification is confirmed', 'Our Trust team reviewed your identity checks. Everything is in order.', userId);
          if (review === 'revoked') {
            notify(userId, 'Verification revoked', `Reason: ${reason}. You can’t take new jobs or orders until this is resolved.`, '/help', 'verification');
            sendEmail(email, 'Action needed: your Sleek verification', `Our Trust team could not confirm your identity. Reason: ${reason}. Reply in the app’s Help section to resolve it.`, userId);
          }
          return ok(undefined);
        },
        adminSetSkillReview: (artisanId, categoryId, review, reason, workerId) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const a = artisanById(artisanId);
          if (!a) return fail('Artisan not found.');
          const upd = (skills: SkillVerification[]) => skills.map((k) => (k.categoryId === categoryId ? { ...k, postReview: review, status: review === 'revoked' ? ('rejected' as const) : k.status === 'rejected' && review !== 'pending' ? ('approved' as const) : review === 'pending' && k.status === 'rejected' ? ('approved' as const) : k.status, reviewerNote: review === 'revoked' ? reason : k.reviewerNote } : k));
          if (workerId) patchArtisan(artisanId, (x) => ({ workers: x.workers.map((w) => (w.id === workerId ? { ...w, skills: upd(w.skills) } : w)) }));
          else patchArtisan(artisanId, (x) => ({ skills: upd(x.skills) }));
          const cat = category(categoryId);
          if (review === 'revoked') {
            notify(artisanId, `${cat.name} verification revoked`, `Reason: ${reason}. Record a new video from Verification.`, '/verify', 'verification');
            sendEmail(a.email, `Your ${cat.name} verification was revoked`, `Our Trust team reviewed your video. Reason: ${reason}. You can record a new one in the app.`, artisanId);
          } else if (review === 'confirmed') sendEmail(a.email, `${cat.name}: review complete`, `Our Trust team reviewed your ${cat.name} video. You’re all set.`, artisanId);
          return ok(undefined);
        },
        adminSetProductStatus: (productId, status, reason) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const it = get().products.find((x) => x.id === productId);
          if (!it) return fail('Product not found.');
          set((st) => ({ products: st.products.map((x) => (x.id === productId ? { ...x, status } : x)) }));
          if (it.sellerId) notify(it.sellerId, status === 'unlisted' ? 'Listing hidden by Sleek' : 'Listing restored', `${it.name}${status === 'unlisted' ? ` — ${reason}` : ''}`, '/seller', 'system');
          return ok(undefined);
        },
        adminReplyTicket: (ticketId, text) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const t = get().tickets.find((x) => x.id === ticketId);
          if (!t) return fail('Ticket not found.');
          if (text.trim().length < 2) return fail('Write a reply.');
          const at = nowIso();
          const name = `${r.value.name.split(' ')[0]} (Sleek Support)`;
          set((st) => ({ tickets: st.tickets.map((x) => (x.id === ticketId ? { ...x, status: 'waiting_on_you', assignedTo: x.assignedTo ?? name, updatedAt: at, messages: [...x.messages, { id: uid('tm'), from: 'agent', name, text: text.trim(), at }] } : x)) }));
          notify(t.userId, 'Sleek Support replied', t.subject, `/support/${t.id}`, 'system');
          return ok(undefined);
        },
        adminSetTicketStatus: (ticketId, status) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          set((st) => ({ tickets: st.tickets.map((x) => (x.id === ticketId ? { ...x, status, updatedAt: nowIso(), messages: [...x.messages, { id: uid('tm'), from: 'system', text: status === 'resolved' ? 'Ticket marked as resolved.' : 'Ticket reopened.', at: nowIso() }] } : x)) }));
          return ok(undefined);
        },
        adminSetConfig: (p) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          if (p.commissionRate !== undefined && !(p.commissionRate >= 0 && p.commissionRate <= 0.5)) return fail('Commission must be between 0% and 50%.');
          set((st) => ({ platformConfig: { ...DEFAULT_CONFIG, ...st.platformConfig, ...p } }));
          return ok(undefined);
        },
        adminRefundJob: (jobId, reason) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const j = job(jobId);
          if (!j) return fail('Job not found.');
          if (j.escrow.state !== 'held' && j.escrow.state !== 'frozen') return fail('No money is held for this job.');
          if (reason.trim().length < 5) return fail('Give a reason.');
          patchJob(jobId, (x) => ({ status: 'cancelled', escrow: { ...x.escrow, state: 'refunded', refundedToCustomer: x.escrow.amount, releasedToArtisan: 0, commission: 0, releasedAt: nowIso() }, cancellation: { by: 'admin', reason: reason.trim(), at: nowIso(), refundAmount: x.escrow.amount, artisanCompensation: 0 } as Job['cancellation'], timeline: timeline(x, `Refunded in full by Sleek: ${reason.trim()}`, 'admin') }));
          logProvider('payments', 'refund', `${providerInfo('payments').name}: refund of ${naira(j.escrow.amount)} sent to the customer`);
          sys(jobId, `Sleek refunded ${naira(j.escrow.amount)} to the customer. Reason: ${reason.trim()}`);
          notify(j.customerId, 'Refund sent', `${naira(j.escrow.amount)} for “${j.title}” is on its way back to you.`, `/job/${jobId}`, 'payments');
          notify(j.artisanId, 'Job cancelled by Sleek', `“${j.title}”: ${reason.trim()}`, `/job/${jobId}`);
          return ok(undefined);
        },
        adminSetOrderStatus: (orderId, status, reason) => {
          const r = requireAdmin();
          if (!r.ok) return r;
          const o = get().orders.find((x) => x.id === orderId);
          if (!o) return fail('Order not found.');
          set((st) => ({ orders: st.orders.map((x) => (x.id === orderId ? { ...x, status, timeline: [...x.timeline, { at: nowIso(), label: status === 'cancelled' ? `Cancelled by Sleek: ${reason}. Refund sent.` : `Updated by Sleek: ${status}` }] } : x)) }));
          if (status === 'cancelled') logProvider('payments', 'refund', `${providerInfo('payments').name}: order refund of ${naira(o.total)}`);
          notify(o.userId, status === 'cancelled' ? 'Order cancelled and refunded' : 'Order updated', `Order #${orderId.slice(-6).toUpperCase()}`, `/orders/${orderId}`, 'payments');
          return ok(undefined);
        },

        // ---- ugent ----------------------------------------------------------
        queueUgentRequest: (action, args, summary) => {
          const r: UgentRequest = { id: uid('ug'), userId: me().userId!, action, args, summary, status: 'pending', createdAt: nowIso(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
          set((s) => ({ ugentRequests: [r, ...s.ugentRequests] }));
          notify(r.userId, 'Ugent needs your confirmation', summary, '/ugent');
          return r;
        },
        decideUgentRequest: (id, decision, result, error) =>
          set((s) => ({ ugentRequests: s.ugentRequests.map((r) => (r.id === id ? { ...r, status: error ? 'failed' : decision, decidedAt: nowIso(), result, error } : r)) })),
      };
    },
    {
      name: 'sleek-store',
      version: 5,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hydrated, network, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as State;
      },
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
      // v1 → v2 re-seeded demo data (new history, favourites, referrals). v2 → v3 keeps all data and maps the
      // old System/Light/Dark setting onto the White (default) / Blue / Black themes.
      migrate: (old, version) => {
        const prev = (old ?? {}) as Partial<State>;
        const oldMode = prev.settings?.themeMode as string | undefined;
        const themeMode = oldMode === 'light' ? 'blue' : oldMode === 'dark' ? 'black' : oldMode === 'white' || oldMode === 'black' || oldMode === 'blue' ? oldMode : 'white';
        // v4 → v5 (100 trades, upfront fees, Sleek Hold, guarantors, activation): fresh demo data, same settings.
        if (version < 5) return { ...initialData(), onboarded: !!prev.onboarded, settings: { ...initialData().settings, ...prev.settings, themeMode } } as unknown as State;
        // v3 → v4: Sleek Services sellers, support tickets, provider log, platform settings. Admins sign in to the console, not the app.
        const fresh = initialData();
        const session = prev.session?.role === 'admin' ? {} : prev.session;
        const jobs = version < 4 ? fresh.jobs.concat((prev.jobs ?? []).filter((j) => !fresh.jobs.some((f) => f.id === j.id))) : prev.jobs;
        return { ...fresh, ...prev, jobs, session, sellers: prev.sellers ?? fresh.sellers, products: prev.products ?? fresh.products, tickets: prev.tickets ?? fresh.tickets, emails: prev.emails ?? [], providerLog: prev.providerLog ?? [], platformConfig: { ...DEFAULT_CONFIG, ...prev.platformConfig }, settings: { ...fresh.settings, ...prev.settings, themeMode } } as unknown as State;
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors & derived helpers
// ---------------------------------------------------------------------------

export const DELIVERY_FEE = 2500;

export function cartTotals(lines: CartLine[], items: ServiceItem[] = useStore.getState().products, deliveryFeeOverride?: number) {
  let subtotal = 0;
  let deposit = 0;
  for (const l of lines) {
    const it = items.find((x) => x.id === l.itemId);
    if (!it) continue;
    if (it.kind === 'rental') {
      subtotal += it.price * l.qty * (l.rentalDays ?? 1);
      deposit += (it.deposit ?? 0) * l.qty;
    } else subtotal += it.price * l.qty;
  }
  const deliveryFee = lines.length ? deliveryFeeOverride ?? DELIVERY_FEE : 0;
  return { subtotal, deposit, deliveryFee, total: subtotal + deposit + deliveryFee };
}

export function useCurrentUser(): User | undefined {
  return useStore((s) => {
    const { userId, role } = s.session;
    if (!userId) return undefined;
    if (role === 'customer') return s.customers.find((c) => c.id === userId);
    if (role === 'artisan') return s.artisans.find((a) => a.id === userId);
    if (role === 'seller') return s.sellers.find((a) => a.id === userId);
    return undefined;
  });
}

export function useMySeller(): Seller | undefined {
  return useStore((s) => (s.session.role === 'seller' ? s.sellers.find((a) => a.id === s.session.userId) : undefined));
}

/** The person whose identity is being verified: an artisan (or one of their workers) or a seller. */
export function useVerifiable(workerId?: string): { name: string; identity: IdentityVerification; kind: 'artisan' | 'worker' | 'seller' } | undefined {
  const session = useStore((s) => s.session);
  const seller = useStore((s) => (s.session.role === 'seller' ? s.sellers.find((a) => a.id === s.session.userId) : undefined));
  const artisan = useStore((s) => s.artisans.find((x) => x.id === s.session.userId));
  if (session.role === 'seller') return seller ? { name: seller.name, identity: seller.identity, kind: 'seller' } : undefined;
  if (!artisan) return undefined;
  const w = workerId ? artisan.workers.find((x) => x.id === workerId) : undefined;
  return w ? { name: w.name, identity: w.identity, kind: 'worker' } : { name: artisan.name, identity: artisan.identity, kind: 'artisan' };
}

/** Item lookup from the live catalogue (sellers can add, edit and unlist items). */
export function useProduct(id?: string): ServiceItem | undefined {
  return useStore((s) => s.products.find((x) => x.id === id));
}

/** True when the signed-in account has been suspended by Sleek. */
export function useIsSuspended(): { suspended: boolean; reason?: string } {
  const u = useStore((s) => {
    const id = s.session.userId;
    return s.customers.find((c) => c.id === id) ?? s.artisans.find((a) => a.id === id) ?? s.sellers.find((x) => x.id === id);
  });
  return { suspended: !!u?.suspended, reason: u?.suspendedReason };
}

export function useMyArtisan(): Artisan | undefined {
  return useStore((s) => (s.session.role === 'artisan' ? s.artisans.find((a) => a.id === s.session.userId) : undefined));
}

export function useMyCustomer(): Customer | undefined {
  return useStore((s) => (s.session.role === 'customer' ? s.customers.find((c) => c.id === s.session.userId) : undefined));
}

export function useJob(id?: string): Job | undefined {
  return useStore((s) => s.jobs.find((j) => j.id === id));
}

export function useUnreadCount(): number {
  return useStore((s) => s.notifications.filter((n) => n.userId === s.session.userId && !n.read).length);
}

export function balanceOf(ledger: LedgerEntry[], artisanId: string): number {
  return ledger.filter((l) => l.artisanId === artisanId).reduce((sum, l) => sum + l.amount, 0);
}

// When the admin console (or another tab) changes the shared demo data, reload it here.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'sleek-store') void useStore.persist.rehydrate();
  });
}
