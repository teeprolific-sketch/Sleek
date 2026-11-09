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
  seedReviews,
  serviceItem,
} from '../data/seed';
import { bookableFor, freeWorkersFor, workerFreeFor, workerSkillApproved } from '../domain/availability';
import * as Esc from '../domain/escrow';
import { moderateMessage, type ModerationResult } from '../domain/moderation';
import * as Pool from '../domain/pricePool';
import { isTrusted } from '../domain/trust';
import type {
  Admin,
  AppNotification,
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
  register(input: { phone: string; name: string; role: 'customer' | 'artisan'; accountType?: ArtisanAccountType; businessName?: string; city: string; area: string }): void;
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
    settings: { themeMode: 'system', notifications: true, dataSaver: false, ugentLinked: false },
    customers,
    artisans,
    admins: [SEED_ADMIN],
    jobs,
    messages,
    reviews: seedReviews(artisans),
    disputes: [],
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
      const notify = (userId: ID, title: string, body: string, link?: string) =>
        set((s) => ({ notifications: [{ id: uid('n'), userId, title, body, at: nowIso(), read: false, link }, ...s.notifications] }));
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
        register: ({ phone, name, role, accountType, businessName, city, area }) => {
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
            };
            set((s) => ({ artisans: [...s.artisans, a] }));
            notify(id, 'Welcome to Sleek', 'Verify your identity and each skill to start receiving jobs.', '/verify');
          }
          set({ session: { userId: id, role, phone, token: uid('tok') }, onboarded: true });
        },
        signOut: () => set({ session: {} }),
        setTheme: (mode) => set((s) => ({ settings: { ...s.settings, themeMode: mode } })),
        updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
        resetDemo: () => set({ ...initialData(), onboarded: true, session: {} }),

        // ---- jobs ----------------------------------------------------------
        createJob: (input) => {
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
          set((s) => ({ messages: [...s.messages, { id: uid('msg'), jobId, from: party, kind: 'text', text: text.trim(), at: nowIso() }] }));
          return res;
        },

        proposePrice: (jobId, amount, note) => {
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
          patchJob(jobId, (x) => ({ status: 'in_progress', timeline: timeline(x, 'Artisan started work', 'artisan') }));
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
          const j = job(jobId);
          if (!j || myParty(j) !== 'customer') return fail('Only the customer can approve.');
          if (!Esc.canApprove(j)) return fail('There is nothing to approve yet.');
          releaseToArtisan(j, 'customer_approved');
          return ok(undefined);
        },

        cancelJob: (jobId, reason) => {
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
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hydrated, ...rest } = s;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as State;
      },
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
      migrate: () => ({ ...initialData() }) as unknown as State,
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
