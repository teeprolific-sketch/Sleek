import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { category, categoryName } from '../data/categories';
import {
  DEMO_ADMIN_ID,
  DEMO_ARTISAN_ID,
  DEMO_CUSTOMER_ID,
  SEED_ADMIN,
  seedArtisans,
  seedCustomers,
  seedJobs,
  seedCustomerReviews,
  seedDisputes,
  seedReviews,
  serviceItem,
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
} from '../domain/types';
import { checkSkillVideo, emptyIdentity, statusAfterAutoCheck } from '../domain/verification';
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
}

export interface NewJobInput {
  artisanId: ID;
  categoryId: ID;
  title: string;
  description: string;
  window: TimeWindow;
  addressIndex: number;
  issuePhotos: CapturedMedia[];
  origin?: 'app' | 'ugent';
  workerId?: ID;
}

export interface Actions {
  completeOnboarding(): void;
  signInDemo(kind: 'customer' | 'artisan' | 'team' | 'agency' | 'admin'): void;
  register(input: { phone: string; name: string; role: 'customer' | 'artisan'; accountType?: ArtisanAccountType; businessName?: string; city: string; area: string; referralCode?: string }): Result;
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
  flushOutbox(): void;

  // Admin extras
  updateSafetyAlert(id: ID, status: SafetyAlert['status']): void;
  addAdminNote(targetType: AdminNote['targetType'], targetId: ID, text: string): Result;
  decideGuaranteeClaim(id: ID, approve: boolean, payout: number): Result;

  // Ugent
  queueUgentRequest(action: UgentActionName, args: Record<string, unknown>, summary: string): UgentRequest;
  decideUgentRequest(id: ID, decision: 'confirmed' | 'rejected', result?: unknown, error?: string): void;
}

export type State = Data & Actions & { hydrated: boolean };

const nowIso = () => new Date().toISOString();

function initialData(): Data {
  const artisans = seedArtisans();
  const customers = seedCustomers();
  const { jobs, messages } = seedJobs(customers[0]);
  return {
    onboarded: false,
    session: {},
    settings: { themeMode: 'system', notifications: true, dataSaver: false, ugentLinked: false, language: 'en', seenTips: [] },
    customers,
    artisans,
    admins: [SEED_ADMIN],
    jobs,
    messages,
    reviews: seedReviews(artisans),
    disputes: seedDisputes(),
    violations: [],
    notifications: [
      { id: 'n_welcome', userId: DEMO_CUSTOMER_ID, title: 'Welcome to Sleek', body: 'Your money is protected by escrow until you approve the work.', at: nowIso(), read: false },
      { id: 'n_offer', userId: DEMO_CUSTOMER_ID, title: 'New price offer', body: 'Femi proposed ₦18,000 for “AC not cooling”.', at: nowIso(), read: false, link: '/chat/job_demo_ac' },
      { id: 'n_art', userId: 'art_femi', title: 'New job request', body: 'Amaka Johnson needs AC Repair & Install.', at: nowIso(), read: false, link: '/chat/job_demo_ac' },
    ],
    cart: [],
    orders: [],
    ledger: [
      { id: 'l1', artisanId: DEMO_ARTISAN_ID, type: 'escrow_release', amount: 16200, at: new Date(Date.now() - 3 * 86_400_000).toISOString(), note: 'Brake pad replacement' },
      { id: 'l2', artisanId: DEMO_ARTISAN_ID, type: 'escrow_release', amount: 27000, at: new Date(Date.now() - 6 * 86_400_000).toISOString(), note: 'Engine diagnosis & plugs' },
      { id: 'l3', artisanId: DEMO_ARTISAN_ID, type: 'payout', amount: -20000, at: new Date(Date.now() - 5 * 86_400_000).toISOString(), note: 'Payout to GTBank ••4417' },
    ],
    payouts: [{ id: 'po1', artisanId: DEMO_ARTISAN_ID, amount: 20000, status: 'paid', requestedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), paidAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }],
    ugentRequests: [],
    uploadLog: [],
    customerReviews: seedCustomerReviews(),
    safetyAlerts: [],
    guaranteeClaims: [],
    referrals: [
      { id: 'ref_demo1', code: makeReferralCode('Amaka Johnson', DEMO_CUSTOMER_ID), referrerId: DEMO_CUSTOMER_ID, refereeId: 'cus_demo_friend', refereeName: 'Tolu A.', refereeRole: 'customer', status: 'qualified', reward: REFERRAL_REWARD.customer, at: new Date(Date.now() - 20 * 86_400_000).toISOString(), qualifiedAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
      { id: 'ref_demo2', code: makeReferralCode('Amaka Johnson', DEMO_CUSTOMER_ID), referrerId: DEMO_CUSTOMER_ID, refereeId: 'art_demo_friend', refereeName: 'Segun O.', refereeRole: 'artisan', status: 'pending', reward: REFERRAL_REWARD.artisan, at: new Date(Date.now() - 4 * 86_400_000).toISOString() },
    ],
    adminNotes: [],
    notificationPrefs: {},
    outbox: [],
    network: { online: true, weak: false },
  };
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
        const escrow = Esc.release(j.escrow, isTrusted(a, Date.now()), reason, nowIso());
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
            admin: { userId: DEMO_ADMIN_ID, role: 'admin' as const, phone: '+2348000000009' },
          };
          set({ session: { ...map[kind], token: uid('tok') }, onboarded: true });
        },
        register: ({ phone, name, role, accountType, businessName, city, area, referralCode }) => {
          let referrer: { id: ID; name: string } | undefined;
          if (referralCode?.trim()) {
            const code = referralCode.trim().toUpperCase();
            referrer = [...get().customers, ...get().artisans].map((u) => ({ id: u.id, name: u.name })).find((u) => referralCodeOf(u.id, u.name) === code);
            if (!referrer) return fail('That referral code wasn’t found. Check it, or leave it empty.');
          }
          const id = uid(role === 'customer' ? 'cus' : 'art');
          if (role === 'customer') {
            const c: Customer = { id, role: 'customer', name, phone, area, city, joinedAt: nowIso(), addresses: [{ label: 'Home', line1: 'Add your street address', area, city, state: city }] };
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
              avatarColor: '#0EA5E9',
              business: accountType && accountType !== 'individual' ? { serviceAreas: [area], teamSize: 1, completedOnboarding: false } : undefined,
            };
            set((s) => ({ artisans: [...s.artisans, a] }));
            notify(id, 'Welcome to Sleek', 'Verify your identity and each skill to start receiving jobs.', '/verify');
          }
          if (referrer) {
            const ref: Referral = { id: uid('ref'), code: referralCode!.trim().toUpperCase(), referrerId: referrer.id, refereeId: id, refereeName: `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] ?? ''}.`, refereeRole: role, status: 'pending', reward: REFERRAL_REWARD[role], at: nowIso() };
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
          for (const id of adminIds()) notify(id, 'Protection claim', `${j.title} — up to ${naira(protectionCover(j))}`, '/safety-queue', 'disputes');
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
          if (!canMarkEnRoute(j, Date.now())) return fail('You can mark “on my way” from 3 hours before the job, once escrow is funded.');
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
          if (a.accountType === 'agency' && !/^(RC|BN)?\s?\d{5,8}$/i.test((d.cacNumber ?? '').trim())) return fail('Agencies need a valid CAC registration number (e.g. RC 1234567).');
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
          for (const adm of adminIds()) notify(adm, 'Certificate uploaded', `${nameOf(id)} — ${category(categoryId).name}`, '/admin/verifications', 'verification');
          return ok(undefined);
        },

        // ---- shared extras ---------------------------------------------------
        raiseSafetyAlert: (kind, note, jobId) => {
          const s0 = me();
          const alert: SafetyAlert = { id: uid('sos'), userId: s0.userId!, role: s0.role === 'artisan' ? 'artisan' : 'customer', jobId, kind, note: note.trim(), at: nowIso(), status: 'open' };
          set((s) => ({ safetyAlerts: [alert, ...s.safetyAlerts] }));
          if (jobId) patchJob(jobId, (x) => ({ safetyAlertIds: [...(x.safetyAlertIds ?? []), alert.id] }));
          if (kind !== 'shared_with_contact') {
            for (const id of adminIds()) notify(id, kind === 'sos' ? '🚨 SOS from a user' : 'Safety concern reported', `${nameOf(alert.userId)}${jobId ? ` · job ${jobId.slice(-6).toUpperCase()}` : ''}${note ? ` — ${note.slice(0, 60)}` : ''}`, '/safety-queue', 'safety');
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
        flushOutbox: () => {
          const queued = get().outbox;
          if (!queued.length || isOffline()) return;
          set({ outbox: [] });
          for (const m of queued) set((s) => ({ messages: [...s.messages, { id: m.id, jobId: m.jobId, from: m.from, kind: 'text', text: m.text, at: m.at }] }));
        },

        // ---- admin extras ------------------------------------------------------
        updateSafetyAlert: (id, status) => {
          const a = get().safetyAlerts.find((x) => x.id === id);
          set((s) => ({ safetyAlerts: s.safetyAlerts.map((x) => (x.id === id ? { ...x, status, handledBy: s.session.userId, handledAt: nowIso() } : x)) }));
          if (a && status === 'acknowledged') notify(a.userId, 'Sleek Safety is on it', 'A safety agent has seen your alert and is following up.', '/trust-safety', 'safety');
        },
        addAdminNote: (targetType, targetId, text) => {
          if (me().role !== 'admin') return fail('Admins only.');
          if (text.trim().length < 3) return fail('Write a note.');
          set((s) => ({ adminNotes: [{ id: uid('an'), targetType, targetId, by: s.session.userId!, text: text.trim(), at: nowIso() }, ...s.adminNotes] }));
          return ok(undefined);
        },
        decideGuaranteeClaim: (id, approve, payout) => {
          if (me().role !== 'admin') return fail('Admins only.');
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
          };
          set((st) => ({ jobs: [j, ...st.jobs] }));
          sys(id, 'Chat is protected by Sleek. Phone numbers, emails, links and off-app contact are blocked. Your exact address is shared only after you fund escrow.');
          if (input.issuePhotos.length) {
            for (const m of input.issuePhotos) set((st) => ({ messages: [...st.messages, { id: uid('msg'), jobId: id, from: 'customer', kind: 'media', text: 'Photo of the issue', at, media: m }] }));
          }
          notify(a.id, 'New job request', `${customer.name} needs ${categoryName(input.categoryId)} — ${j.title}.`, `/chat/${id}`);
          return ok(id);
        },

        sendMessage: (jobId, text) => {
          const j = job(jobId);
          const party = j && myParty(j);
          const res = moderateMessage(text);
          if (!j || !party) return { ...res, allowed: false, warning: 'You are not part of this job.' };
          if (!text.trim()) return { ...res, allowed: false, warning: undefined };
          if (['completed', 'resolved', 'cancelled', 'declined'].includes(j.status)) return { ...res, allowed: false, warning: 'This job is closed. Chat is read-only.' };
          if (!res.allowed) {
            const userId = me().userId!;
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
            sys(jobId, `Price locked at ${naira(amount)}. This is now permanent for this job. Next: the customer pays into Sleek Escrow.`);
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
          sys(jobId, 'The artisan declined this request. No payment was taken.');
          notify(j.customerId, 'Request declined', `“${j.title}” was declined. Try another available artisan.`, `/job/${jobId}`);
          return ok(undefined);
        },

        fundEscrow: async (jobId, method) => {
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can fund escrow.');
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
          const res = await payments.fundEscrow({ jobId, amount: j.pricePool.locked!.amount, method });
          if (!res.ok) return fail(res.error ?? 'Payment failed. You have not been charged.');
          const fresh = job(jobId)!;
          const escrow = Esc.fundEscrow(fresh, res.reference!, nowIso());
          patchJob(jobId, (x) => ({ escrow, status: 'funded', workerId, timeline: timeline(x, `${naira(escrow.amount)} paid into Sleek Escrow`, 'customer') }));
          sys(jobId, `Escrow funded: ${naira(escrow.amount)} is held safely by Sleek. The job address is now shared with the artisan.`);
          notify(a.id, 'Escrow funded — job confirmed', `${naira(escrow.amount)} is held for “${j.title}”. Address unlocked.`, `/job/${jobId}`);
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
          if (!Esc.canStart(j, Date.now())) return fail('You can start from 1 hour before the agreed time, once escrow is funded.');
          patchJob(jobId, (x) => ({ status: 'in_progress', startedAt: nowIso(), enRouteAt: x.enRouteAt, timeline: timeline(x, 'Artisan started work', 'artisan') }));
          sys(jobId, 'The artisan has started work.');
          notify(j.customerId, 'Work started', `Your artisan has started “${j.title}”.`, `/job/${jobId}`);
          return ok(undefined);
        },

        logCapture: (purpose, uri, jobId) => {
          const m: CapturedMedia = { id: uid('med'), uri, purpose, capturedAt: nowIso(), loggedBy: me().userId ?? 'anon' };
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
          if (!Esc.canDispute(j)) return fail('Disputes can be opened while money is held in escrow.');
          if (details.trim().length < 15) return fail('Please describe the problem in a few sentences (at least 15 characters).');
          const id = uid('dsp');
          const d: Dispute = { id, jobId, openedBy: party, reason, details: details.trim(), evidence, status: 'open', openedAt: nowIso() };
          set((s) => ({ disputes: [d, ...s.disputes] }));
          patchJob(jobId, (x) => ({ status: 'disputed', disputeId: id, escrow: { ...x.escrow, state: 'frozen' }, timeline: timeline(x, `Dispute opened by ${party}`, party) }));
          if (party === 'customer') patchArtisan(j.artisanId, (a) => ({ stats: { ...a.stats, disputesOpened: a.stats.disputesOpened + 1 } }));
          sys(jobId, 'A dispute has been opened. The money stays in escrow until Sleek reviews the chat history and proof of work. This usually takes 1–3 working days.');
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
          set((s) => ({
            orders: s.orders.map((o) => {
              const idx = steps.indexOf(o.status);
              if (idx < 0 || idx === steps.length - 1) return o;
              const elapsed = now - new Date(o.placedAt).getTime();
              const target = Math.min(steps.length - 1, Math.floor(elapsed / 90_000));
              if (target <= idx) return o;
              const labels: Record<Order['status'], string> = { placed: 'Order placed', confirmed: 'Vendor confirmed your order', dispatched: 'Rider picked up your order', delivered: 'Delivered', returned: 'Returned', cancelled: 'Cancelled' };
              const newTimeline = [...o.timeline];
              for (let k = idx + 1; k <= target; k++) newTimeline.push({ at: new Date().toISOString(), label: labels[steps[k]] });
              return { ...o, status: steps[target], timeline: newTimeline };
            }),
          }));
        },

        // ---- artisan -------------------------------------------------------
        setOnline: (online) => {
          const id = me().userId!;
          const a = artisanById(id);
          if (!a) return fail('Not an artisan account.');
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
          const id = me().userId!;
          const res = await identityProvider.lookupNIN(nin.replace(/\s/g, ''), name);
          const status = res.ok ? 'passed' : 'failed';
          const update = (i: Artisan['identity']) => ({ ...i, nin: status, ninLast4: nin.slice(-4), fullNameOnRecord: res.fullName }) as Artisan['identity'];
          if (workerId) patchArtisan(id, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, identity: update(w.identity) } : w)) }));
          else patchArtisan(id, (a) => ({ identity: update(a.identity) }));
          return res.ok ? ok(undefined) : fail(res.error ?? 'NIN verification failed.');
        },

        completeLiveness: async (frames, challenges, workerId) => {
          const id = me().userId!;
          const live = await identityProvider.checkLiveness({ frames, challenges });
          if (!live.passed) {
            const upd = (i: Artisan['identity']) => ({ ...i, liveness: 'failed' as const });
            if (workerId) patchArtisan(id, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, identity: upd(w.identity) } : w)) }));
            else patchArtisan(id, (a) => ({ identity: upd(a.identity) }));
            return fail(live.reason ?? 'Liveness check failed.');
          }
          const match = await identityProvider.faceMatch({ selfieRef: live.selfieRef!, referenceRef: 'nimc' });
          const passed = match.score >= 0.85;
          const upd = (i: Artisan['identity']) =>
            ({ ...i, liveness: 'passed', faceMatch: passed ? 'passed' : 'failed', faceMatchScore: match.score, verifiedAt: passed ? nowIso() : undefined }) as Artisan['identity'];
          if (workerId) patchArtisan(id, (a) => ({ workers: a.workers.map((w) => (w.id === workerId ? { ...w, identity: upd(w.identity) } : w)) }));
          else patchArtisan(id, (a) => ({ identity: upd(a.identity) }));
          if (passed) notify(id, 'Identity verified', workerId ? 'Your worker’s identity is verified.' : 'You now have the Identity Verified badge. Next: verify your skills.', '/verify');
          return passed ? ok(undefined) : fail('Your face did not match your NIN record photo. Try again in good light, or contact support.');
        },

        submitSkillVideo: async ({ categoryId, uri, durationSec, workerId }) => {
          const id = me().userId!;
          const a = artisanById(id)!;
          const ident = workerId ? a.workers.find((w) => w.id === workerId)?.identity : a.identity;
          if (!ident || ident.faceMatch !== 'passed') return fail('Finish identity verification first.');
          const recordedAt = nowIso();
          const analysis = await identityProvider.analyseSkillVideo({ uri, durationSec, identityRef: id });
          const video = { id: uid('vid'), uri, durationSec, recordedInApp: true as const, livenessPassed: analysis.livenessPassed, faceMatchScore: analysis.faceMatchScore, recordedAt, captureHash: captureHash(uri, recordedAt) };
          const check = checkSkillVideo(video);
          const cat = category(categoryId);
          const status = statusAfterAutoCheck(cat, check);
          const entry: SkillVerification = {
            categoryId,
            status,
            video,
            submittedAt: recordedAt,
            reviewerNote: check.ok ? undefined : check.problems.join(' '),
            certificateRequired: cat.risk === 'high',
          };
          const upsert = (skills: SkillVerification[]) => [...skills.filter((s) => s.categoryId !== categoryId), entry];
          if (workerId) patchArtisan(id, (x) => ({ workers: x.workers.map((w) => (w.id === workerId ? { ...w, skills: upsert(w.skills) } : w)) }));
          else patchArtisan(id, (x) => ({ skills: upsert(x.skills) }));
          if (check.ok) notify(DEMO_ADMIN_ID, 'Skill video to review', `${a.businessName ?? a.name} — ${cat.name}${cat.risk === 'high' ? ' (high-risk)' : ''}`, '/admin/verifications');
          return check.ok ? ok(status) : fail(check.problems.join(' '));
        },

        addWorker: (name) => {
          const id = me().userId!;
          const a = artisanById(id);
          if (!a || a.accountType === 'individual') return fail('Only Team and Agency accounts can add workers.');
          if (name.trim().length < 3) return fail('Enter the worker’s full name.');
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
          if (me().role !== 'admin') return fail('Admins only.');
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
          if (me().role !== 'admin') return fail('Admins only.');
          const d = get().disputes.find((x) => x.id === disputeId);
          const j = d && job(d.jobId);
          if (!d || !j) return fail('Dispute not found.');
          if (d.status === 'resolved') return fail('Already resolved.');
          if (note.trim().length < 10) return fail('Add a short explanation for both parties.');
          const a = artisanById(j.artisanId)!;
          const share = outcome === 'release_to_artisan' ? 1 : outcome === 'refund_customer' ? 0 : artisanShare;
          const escrow = Esc.resolveDisputeEscrow(j.escrow, share, isTrusted(a, Date.now()), nowIso());
          set((s) => ({ disputes: s.disputes.map((x) => (x.id === disputeId ? { ...x, status: 'resolved', resolution: { outcome, artisanShare: share, note: note.trim(), by: me().userId!, at: nowIso() } } : x)) }));
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
          const totals = cartTotals(lines);
          const id = uid('ord');
          if (isOffline()) return fail(OFFLINE);
          const res = await payments.payOrder({ orderId: id, amount: totals.total, method });
          if (!res.ok) return fail(res.error!);
          const at = nowIso();
          const o: Order = { id, userId, lines, subtotal: totals.subtotal, deposit: totals.deposit, deliveryFee: totals.deliveryFee, total: totals.total, deliverTo, deliveryAddress: address, jobId, status: 'placed', placedAt: at, timeline: [{ at, label: 'Order placed' }], eta: new Date(Date.now() + 3 * 3_600_000).toISOString() };
          set((s) => ({ orders: [o, ...s.orders], cart: [] }));
          notify(userId, 'Order placed', `Order #${id.slice(-6).toUpperCase()} — ${naira(totals.total)}. We’ll keep you updated.`, `/orders/${id}`);
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
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hydrated, network, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as State;
      },
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
      // v1 → v2 added history, favourites, referrals and more. Demo data is re-seeded; theme is kept.
      migrate: (old) => ({ ...initialData(), settings: { ...initialData().settings, themeMode: (old as Partial<State>)?.settings?.themeMode ?? 'system' } }) as unknown as State,
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors & derived helpers
// ---------------------------------------------------------------------------

export const DELIVERY_FEE = 2500;

export function cartTotals(lines: CartLine[]) {
  let subtotal = 0;
  let deposit = 0;
  for (const l of lines) {
    const it = serviceItem(l.itemId);
    if (!it) continue;
    if (it.kind === 'rental') {
      subtotal += it.price * l.qty * (l.rentalDays ?? 1);
      deposit += (it.deposit ?? 0) * l.qty;
    } else subtotal += it.price * l.qty;
  }
  const deliveryFee = lines.length ? DELIVERY_FEE : 0;
  return { subtotal, deposit, deliveryFee, total: subtotal + deposit + deliveryFee };
}

export function useCurrentUser(): User | undefined {
  return useStore((s) => {
    const { userId, role } = s.session;
    if (!userId) return undefined;
    if (role === 'customer') return s.customers.find((c) => c.id === userId);
    if (role === 'artisan') return s.artisans.find((a) => a.id === userId);
    return s.admins.find((a) => a.id === userId);
  });
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
