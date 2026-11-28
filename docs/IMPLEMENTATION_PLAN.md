# Sleek: implementation plan (beta → launch zone → expansion)

Status: **draft, waiting for founder approval**. Nothing in this plan has been built yet.
Read `docs/CURRENT_STATE.md` first. This plan extends the existing Expo + Fastify + Postgres stack and does not rewrite it.

## 1. How the work is cut

- **One milestone = one reviewable PR**, with tests for its critical paths, its migration and its docs.
- **Milestones are ordered by dependency.** Milestones 1.0–1.3 are foundations that everything else needs.
- **Every new rule reads from `config_settings`** (it can be overridden per zone), and every new feature sits behind a feature flag.
- **The shared rules layer stays.** New rules go into `src/domain` as pure functions, so the app, the server and the admin all use the same code.
- **Migrations are additive.** Existing JSONB documents stay. Typed tables and columns are added for money, state, queues and reporting. Old fields are backfilled, then retired in a later migration.
- **Size key:** S is a few days, M is about a week, L is two weeks or more (one engineer, rough).
- **⛔ marks a milestone that is blocked on a founder decision** (section 6).

## 2. Phase 1: trust, money and the launch zone

### 1.0 Foundations (M)

- **Money:** move to integer **kobo plus a `currency` code** everywhere. Add `amount_minor` and `currency` columns to `payments`, `ledger` and `payouts`, plus new money tables, and backfill from naira × 100. In `src/domain` add a `Money` type and helpers (no floats). Update `formatNaira` and the Paystack adapter (no more ×100 at the boundary).
- **Config:**
  - `config_settings` (key, value JSONB, zone_id nullable, version, updated_by, updated_at) plus `config_history`.
  - A typed registry in `server/src/config/settings.ts` with defaults.
  - Move every hard-coded rule listed in CURRENT_STATE §7.9 into it.
- **Feature flags:** `feature_flags` (key, enabled, zone_ids, user_groups, percentage). Add `isEnabled(flag, ctx)` on server and client. Turn **off** for launch: `sleek_services`, `team_accounts`, `ugent`.
- **Events:**
  - `job_events` (job_id, from_status, to_status, actor_type, actor_id, reason, at).
  - `analytics_events` (name, user_id, job_id, zone_id, props, at).
  - Emitted server-side.
- **Observability:**
  - Production logging with request IDs and redaction (phone, NIN, card, tokens).
  - An error-tracking hook.
  - `/health` and `/ready`.
- **Hardening:**
  - A general rate limiter (`@fastify/rate-limit`, which fits Fastify).
  - An `Idempotency-Key` header with an `idempotency_keys` table for every mutating endpoint.
  - Split `app.ts` into `server/src/routes/{public,customer,artisan,admin,partner,webhooks}.ts`.
  - CORS allowlist for the admin origin.
- **CI:** GitHub Actions running typecheck, app jest, and server tests against a Postgres service.
- **Migration** `003_foundations.sql`. **Tests:** money maths, the config resolver (zone override), flags, idempotency replay, rate limits.

### 1.1 Admin identity and admin API (M)

- **Accounts:** `admin_users` (separate from `users`), `admin_roles`, `admin_role_assignments`, `admin_sessions`. Staff sign in with email, password and **TOTP 2FA**. Sessions are short (8h), with an optional IP allowlist.
- **Roles (§9.1):** Super Admin, Ops Manager, Support Agent, Verification Officer, Screening Reviewer, Finance, Trust & Safety, Marketing, Analyst. Permissions are checked on every route.
- **Namespace:** a new `/admin/v1/*` with its own auth. The existing `/v1/admin/*` routes move there and are then removed.
- **Audit:** `audit_log` gains `before`, `after`, `reason`, `ip` and `request_id`. It is written in the same transaction as the change and is append-only (enforced by a DB trigger; there is no delete route).
- **Masking:** phone numbers, addresses and identity data are masked by default. `POST /admin/v1/reveal` requires a reason and writes an audit entry.
- **Maker-checker:** `approval_requests` for refunds, manual payouts and payout-detail overrides above a configured amount.
- **Migration** `004_admin.sql`. **Tests:** every admin route refuses the wrong role; the audit entry exists for each mutation; maker-checker needs two different admins.

### 1.2 Job state machine v2 (L)

- **States:** implement §4 exactly in `src/domain/jobMachine.ts`: an explicit transition table, guards and side branches.
- **Mapping from today's states:**

  | Today | v2 |
  | --- | --- |
  | `requested` | `requested` |
  | `price_agreed` | `quote_accepted` |
  | `funded` | `payment_held` |
  | `in_progress` | `in_progress` |
  | `proof_submitted` | `awaiting_confirmation` |
  | `completed` | `completed`, then `payout_released` |
  | `disputed` / `resolved` | unchanged |
  | `cancelled` | `cancelled_by_customer` or `cancelled_by_artisan` |
  | `declined` | `cancelled_by_artisan` |

- **New states:** `matching`, `quoted`, `artisan_en_route`, `arrived`, `quote_change_requested`, `artisan_no_show`, `customer_no_show`, `payout_released`, `refunded`, `partially_refunded`.
- **Server only:** a single `transition(job, to, actor)` service writes `job_events`. No other code changes the status.
- **Jobs table:** `artisan_id` becomes **nullable** while matching. Add `zone_id`, `area_label`, `urgency`, `booked_via`, `contact_unlocked_at` and `location_unlocked_at`.
- **Migration** `005_job_v2.sql` (with backfill). **Tests:** every legal and illegal transition, and that payout is impossible while disputed.

### 1.3 Zones, waitlist and categories (S)

- **Tables:** `zones` (city, name, areas list or GeoJSON polygon, active, launch_date, overrides) and `waitlist_entries`.
- **Categories:** move from a client constant to a `service_categories` table, seeded from `src/data/categories.ts`.
- **Rules:** a booking is refused outside active zones. The app shows a "not in your area yet" screen with the waitlist. Matching filters by `artisan_zones`.
- **Seed:** one demo zone.
- **Migration** `006_zones.sql`.

### 1.4 Quotes, price ranges and fixed prices (M)

- **Quotes:** `quotes` (labour, materials, materials breakdown, total, currency, valid_until, status) and `quote_change_requests`. The **Price Pool becomes Quotes**; a customer counter becomes "ask for a revised quote".
- **Prices:**
  - `price_ranges` (category, zone, job_type, min, max, source).
  - `fixed_price_jobs` (instant price, configured in admin).
- **Mid-job changes:** only through an approved change request. An increase creates a **top-up** payment held the same way.
- **Migration** `007_quotes.sql`.

### 1.5 Payments v2: booking fee, held funds, bank transfer, reconciliation (L) ⛔ D1

- **Provider interface:** `PaymentProvider` covering collections (card, transfer, USSD), a virtual-account transfer flow, hold/release or split, refunds, payouts and card-BIN country. The current Paystack adapter is refactored onto it, and a second provider slot is added.
- **Checkout:** one checkout covers the **job amount, held**, plus the **₦500 booking fee**, which goes to Sleek as revenue. The fee comes from config, never from the client.
- **Records:**
  - `escrow_holds` (payment, amount held, status, release_at).
  - `refunds` (with approver).
  - `fees` (booking fee charged and refunded).
  - A **double-entry `ledger_entries`** table covering Sleek revenue, the artisan payable, the guarantee reserve and payment fees (the current artisan ledger becomes one account).
- **Webhooks:** keep the signature check, re-verification and idempotency. Add **replay protection** (event ID store, timestamp window).
- **Unlock:** a held-payment webhook triggers `payment_held` and unlocks the location and contacts (1.6).
- **Reconciliation:** a daily job compares our records with the provider's, and mismatches go to an admin queue.
- **Booking-fee refund rules:** an artisan no-show or cancellation with no successful re-match, or no artisan found, means a refund. A customer cancelling after the artisan is en route means the fee is kept.
- **Migration** `008_payments_v2.sql`. **Tests:** fee charge and refund matrix, webhook replay, amount mismatch, double release, reconciliation diff.

### 1.6 Unlock rules (S)

- **What unlocks at `payment_held`:** `jobView` reveals the exact address, map pin, landmark notes, beneficiary and **both phone numbers** only from `payment_held` onwards.
- **Server enforcement:** tracking and contact endpoints refuse before then. Admins see masked data unless they give a reason.
- **Tests:** every route that returns a job or user, before and after `payment_held`.

### 1.7 Matching v1 (M)

- **Offers:** `job_offers` (job, artisan, rank, sent_at, expires_at, response). Offers go out in ranked order with a short acceptance timeout, then fall back to the next artisan.
- **Filters and ranking:** filter by trade, zone, verification, approved SkillProof for that trade, availability and distance. Rank by the existing `ranking.ts` plus punctuality, recent load (spread work fairly) and customer preferences (female artisan, previous artisan).
- **Ops alert:** if nobody is matched within the configured time, the job goes to the admin matching queue.
- **Logging:** `matching_logs` stores features and outcomes from day one, ready for an ML ranker in Phase 2.
- **Direct booking stays:** "Book [name] again" and direct booking skip straight to that artisan's quote.
- **Migration** `009_matching.sql`. **Tests:** timeout and fallback, preference filters, fair spread.

### 1.8 Artisan onboarding and verification v2 (L) ⛔ D2

- **Tables:**
  - `verification_records` (government ID, liveness and face match, guarantor, address).
  - `skill_proofs` (per trade; method is live video, timed assessment, quiz, portfolio or certificate; plus reviewer).
  - `guarantors`.
  - `trade_quizzes` and `assessment_scripts`.
- **Gate:** an artisan can take jobs only with approved ID **and** an approved SkillProof **for that trade**. The current automated video gate becomes one SkillProof method; the human reviewer decides.
- **Probation:** the first N jobs per trade are on probation, with a rating threshold and a follow-up check.
- **Badges:** Verified, Top Rated, Sleek Certified. Thresholds come from config.
- **Digital ID:** a digital ID card with a QR code, and a public page `GET /verify/:token` showing photo, name, badge and active status only.
- **Low-data onboarding:** progress saved at every step, in English and Pidgin.
- **Sensitive data:** encrypted at rest (pgcrypto or an application-level key from KMS). Store only the provider reference and the last 4 digits.
- **Migration** `010_verification_v2.sql`.

### 1.9 Contact screening v2 (L) ⛔ D3, D4

- **Results:** a `screening_results` table, and `screening_status` on messages, photos, quotes, reviews and profiles.
- **Text:** keep the current detector. Grow the test set (disguised numbers, handles and off-platform phrases in English and Pidgin, payment diversion such as "send the balance to my account").
- **Voice notes in chat only:** upload, then transcribe, then screen, then deliver. Blocked notes are never delivered. Spoken digits in English and Pidgin first.
- **Photos:** OCR plus image classification (phone, account number, email, URL, handle, QR code, business card or flyer, screenshot). Meter readings, model numbers and measurements must pass. Borderline cases go to **human review** instead of being blocked silently.
- **Review and appeals:** an admin screening queue with appeals, and the false-block rate shown.
- **Strikes:** `off_platform_attempt_count` feeds warnings and then suspension, at thresholds from config, plus ranking penalties.
- **Latency target:** about 1–2 seconds. Screening runs as an async worker and the message shows "sending…".
- **Migration** `011_screening.sql`. **Tests:** a large fixture set, including job photos that must pass.

### 1.10 Live tracking, arrival and safety (L) ⛔ D5

- **Tables:** `tracking_sessions` and `location_pings` (encrypted, deleted by a retention job).
- **Session rules:** a session starts at "On my way" (only after `payment_held`) and stops on arrival confirmation, cancellation, timeout or being turned off.
- **Two-way map:**
  - The customer can pause sharing.
  - For diaspora bookings, a beneficiary SMS link shares the location instead (built in Phase 2).
  - Updates adapt to distance to save data, and the app shows the last known position if the network drops.
- **Arrival:** confirmed by a distance threshold plus a check-in tap. A far-away check-in is flagged.
- **Messages:** "I'm outside" and "Meet me here" quick messages, and lateness alerts.
- **Safety:**
  - A punctuality score.
  - A trusted-contact live link.
  - The emergency button alerts ops (with sound in admin) and shows emergency numbers.
  - The female-artisan request goes into matching.
- **Docs:** revise the "no maps SDK" rule in `ARCHITECTURE.md`.
- **Migration** `012_tracking.sql`. **Tests:** no tracking before `payment_held`; stops on arrival, cancel and timeout; the pause is respected.

### 1.11 Cancellations and no-shows (M)

- **Fees by stage:** cancellation fees depend on the job's stage (from config). Part of a late fee goes to the artisan.
- **No-shows:**
  - `artisan_no_show` is auto-detected; Sleek re-matches and the reliability score drops.
  - `customer_no_show` needs a check-in and a wait period; a fee applies.
- **Booking-fee rules** come from 1.5.
- **Tests:** the full matrix of stage × who cancels.

### 1.12 Photo proof (S)

- **Tables:** `job_photos` (stage before/during/after, live camera only, screened, `consent_for_marketing` defaulting to false).
- **Rules:** before-photos are required to enter `in_progress`, and after-photos to enter `awaiting_confirmation`.
- **Storage:** a compressed copy for viewing, with the original kept for disputes. ⛔ D6 (storage).

### 1.13 Ratings (S)

- **Blind:** neither side sees the other's rating until both are in, or a timeout passes.
- **Tags and screening:** tags per direction, and review comments are screened.
- **Customer ratings feed matching and flags.**

### 1.14 Disputes and the Sleek Guarantee (M)

- **Disputes:**
  - The dispute window comes from config.
  - `dispute_evidence` (screened), with chat, transcripts and photos attached automatically.
  - SLA timers.
  - A `dispute_playbook` editable in admin.
  - Resolutions: release, partial refund, full refund or **redo with another artisan**.
- **Guarantee:**
  - **Sleek Protection becomes the Sleek Guarantee.**
  - A **reserve ledger account takes 20% of each job's commission** (from config).
  - Claims are paid from the reserve.
  - It has a hook for an insurance partner (Phase 3).

### 1.15 Same-day payouts (M)

- **Automatic:** a payout is queued on `completed` and sent the same day by the provider.
- **Earnings screen:** gross, commission, fees, net and status.
- **Changing payout details:** cooling-off, OTP re-verification and a fraud check, all visible in admin.

### 1.16 Support (S)

- **Tickets:** `support_tickets` with messages, created with the job context, plus a WhatsApp support link.
- **Admin inbox:** priority, SLA, assignment and canned responses.

### 1.17 Fraud v1 (M)

- **Queue:** `fraud_signals` plus an admin queue with actions (clear, suspend, ban, hold payouts).
- **Rules:**
  - device fingerprint and a limit on accounts per device;
  - promo and referral limits;
  - chat-then-cancel-before-escrow;
  - pairs who cancel together;
  - new account with a high-value job;
  - repeated disputes;
  - collusion pairs;
  - linked-account reviews;
  - payout change followed by a quick payout;
  - check-in location mismatch.

### 1.18 Go Live voice assistant (L) ⛔ D3, D7

- **Session:** `go_live_sessions` (transcript with short retention, extracted requirements, suggested artisans, resulting job).
- **Flow:** a real-time voice conversation with Sleek's assistant. It asks short follow-up questions, confirms on screen, shows matching artisans, and leads into the normal quote, accept and escrow flow. Falls back to text on a weak network.
- **Privacy:** artisans never get the audio.
- **Rollout:** behind a flag, enabled after the core money flow is stable. **It is the last item in Phase 1.**

### 1.19 Low data, offline and SMS fallback (M) ⛔ D8

- **Offline outbox:** extend it to check-in, photos and status changes, with a "pending sync" state and idempotent endpoints (from 1.0).
- **SMS fallback:** for job offers, arrival and payout sent.
- **Expo push:** real Expo push notifications.
- **Bundle size:** a budget for the artisan flows, and lazy-loaded screens.

### 1.20 Legal and privacy (S)

- **Terms:** `terms_versions` and `terms_acceptances`, with placeholder text marked for the founders.
- **Privacy requests:** `privacy_requests` (export and delete) with deadlines in admin.
- **Retention jobs:** location pings, Go Live transcripts and screening media.

### 1.21 Analytics and the metrics dashboard (M)

- **Events:** every §5.20 event is emitted server-side (from 1.0).
- **Dashboard:**
  - **GMV and revenue shown separately**, with revenue split into commission, booking fees and other fees, plus take rate;
  - funnels;
  - liquidity (time to match);
  - leakage;
  - Go Live conversion;
  - cohorts;
  - contribution margin per job;
  - the guarantee reserve;
  - payout speed.
- **Implementation:** SQL views and materialised views refreshed by the worker.

### 1.22 Operations baseline (S)

- **Staging:** a staging environment with the provider in test mode.
- **Operations:** monitoring and alerts (failed payments, payouts, webhooks, queue backlog, slow endpoints), daily backups with a **tested** restore, and a rollback procedure.
- **Docs:** `docs/INCIDENT_PLAYBOOK.md` and `docs/playbooks/*`.
- **Scans:** a dependency vulnerability scan in CI, and a repeatable secrets scan.
- **Worker:** move the scheduler into its own worker process.

### 1.23 Admin console (web) (L, built alongside 1.1–1.21)

- **App:** a new `admin/` app (React + TypeScript, web-only) that talks only to `/admin/v1`.
- **Phase 1 modules (§9.2):**
  - 1 Overview, 2 Live jobs, 3 Matching queue, 4 Artisans, 5 Verification queue, 5a Screening queue;
  - 6 Customers, 7 Payments and finance, 8 Disputes, 9 Support, 10 Trust & safety;
  - 11 Pricing and config, 12 Zones, 19 Metrics, 20 Privacy requests, 21 Admin users and audit log.
- **Shared foundations:** a shared layout and components, and an audit-log format compatible with the future Me AI Console (§10).
- **Removal:** delete the admin screens from the mobile app once the console reaches parity.

### 1.24 Wire the mobile app to the API (L, runs through the whole phase)

- **API client:** `src/api/client.ts`, with the session token in `expo-secure-store`, retries with backoff and idempotency keys.
- **The store becomes a cache:** move each store action onto its endpoint following `docs/BACKEND_CONTRACT.md`, then delete the store's built-in backend logic.
- **Demo mode stays:** a `EXPO_PUBLIC_DEMO` build keeps a mock API adapter, so investor demos still work offline.

**Phase 1 deliverables (§11):**
- `docs/API.md`, `docs/CONFIG.md`, `docs/ADMIN_GUIDE.md`, `docs/playbooks/*`;
- seed data for the demo zone;
- an investor demo script;
- this plan with statuses updated.

## 3. Phase 2: retention, growth and smarter AI

| # | Item | Main changes | Migration |
| --- | --- | --- | --- |
| 2.1 | Maintenance plans (Sleek Home Care) | `plans`, `subscriptions`, `plan_visits`; recurring billing through the provider; priority matching; visit reports; MRR and churn in admin | `013_plans` |
| 2.2 | Diaspora mode | `account_region` and `region_signals` on customers, assigned by the system from phone, card BIN, payment source, store country, locale/timezone and IP (VPN counts as unknown); **local price requires a Nigerian payment method**; repricing or hold on mismatch; grace period and appeal; beneficiary booking with an SMS link; GBP/USD/EUR/CAD with FX shown; diaspora price book; separate revenue | `014_diaspora` |
| 2.3 | Seasonal campaigns | `campaigns` with capacity caps per zone/category per day, next-available windows, artisan incentives, campaign report | `015_campaigns` |
| 2.4 | AI price estimation | Train on completed jobs; ranges for customers, guidance for artisans; versioned model; admin override. Never sets the final price | `016_models` |
| 2.5 | Smarter matching | Ranking model trained on `matching_logs`; A/B test against the rules behind a flag | n/a |
| 2.6 | AI fraud detection | Model scores over the Phase 1 signals, including photo reuse and collusion graphs; humans decide | n/a |
| 2.7 | Voice and language AI | Yoruba, Igbo and Hausa transcription and translation; Go Live v2; photo scanner retrained on Sleek's own labels; Model Labs integration with a fallback | n/a |
| 2.8 | Sleek Academy | `training_courses`, `training_completions`; offline-friendly content; quizzes; Certified badge plus a ranking boost | `017_academy` |
| 2.9 | Uniforms and ID | Issuance tracking in admin, linked to the Phase 1 QR page | in `017` |
| 2.10 | Community | Artisan of the Month, an announcements channel, consented stories | `018_community` |
| 2.11 | Financial tools | Statements and proof of income; consent-gated data sharing hooks for licensed partners | `018` |
| 2.12 | Reasons to stay | Warranty period per category (free redo), receipts, history | `018` |
| 2.13 | Quality assurance | Follow-up samples, mystery-customer flags, photo review samples | `019_qa` |
| 2.14 | Growth | Partner portal (estates, facility managers), B2B accounts with invoicing, agent packages, referral v2, **SEO pages per service × area**, a Google Business checklist, content export, acquisition-channel tracking | `020_partners` |
| 2.15 | Ugent | The existing gateway, hardened: OAuth-style consent, scoped and revocable tokens, `booked_via = ugent`. Flag switched on only after Phase 1 is stable | n/a |

**Admin modules added in Phase 2:** 5b Region reviews, 13 Plans, 14 Campaigns and promos, 15 Partners, 16 Academy, 17 QA, 18 Content.

## 4. Phase 3: expansion and new revenue

| # | Item | Main changes | Migration |
| --- | --- | --- | --- |
| 3.1 | Genuine materials | `suppliers`, `material_items`, `material_orders`; "Sleek supplies materials" option on quotes; counterfeit complaints and supplier suspension | `021_materials` |
| 3.2 | Multi-city | A zone launch checklist that blocks activation until done; city pricing, categories and campaigns; waitlist demand map | `022_zone_launch` |
| 3.3 | Insurance partner | Large claims routed to the insurer through the guarantee hook | `023_insurance` |
| 3.4 | Physical-AI data foundation | Consented, anonymised dataset kept separate from production data, with consent records | `024_research` |

## 5. Every prompt section mapped

| Prompt § | Phase / milestone |
| --- | --- |
| §1 principles | All milestones. Customer copy is reviewed to lead with trust, not "AI" (part of 1.24). |
| §2 surfaces | Customer and artisan apps 1.24; admin console 1.23; partner portal 2.14; backend and workers 1.0 and 1.22 |
| §3 data model | 1.0–1.20 for the Phase 1 entities; 2.x and 3.x for Plan, Subscription, Partner, Training, Supplier and the rest |
| §4 state machine | 1.2 (cancellations and no-shows in 1.11) |
| §5.1 | 1.3 |
| §5.2 | 1.8 |
| §5.3 | Booking 1.3, 1.4, 1.24; booking fee 1.5; Go Live 1.18 |
| §5.3a | 1.9 (unlock in 1.6) |
| §5.4 | 1.7 |
| §5.5 | 1.4 |
| §5.6 | 1.5 |
| §5.7 | 1.15 |
| §5.8 | 1.14 |
| §5.9 | 1.10 (emergency and trusted contact), 1.6 (unlock) |
| §5.10 | 1.10 |
| §5.11 | 1.11 |
| §5.12 | 1.12 |
| §5.13 | 1.13 |
| §5.14 | 1.14 |
| §5.15 | 1.16 |
| §5.16 | 1.17 |
| §5.17 | 1.19 |
| §5.18 | 1.9 and 1.18 (voice); 2.7 (more languages) |
| §5.19 | 1.20 |
| §5.20 | 1.0 (events), 1.21 (dashboard) |
| §5.21 | 1.0, 1.22, plus tests in every milestone |
| §6.1–§6.15 | 2.1–2.15 |
| §7.1–§7.4 | 3.1–3.4 |
| §8 not in scope | Enforced through flags and config (single active zone, no voice outside chat, no unlock before `payment_held`) |
| §9 admin | 1.1 (security and API), 1.23 (Phase 1 modules), Phase 2 modules above |
| §10 Me AI Console | 1.1 and 1.23 are built standalone, using the shared identity, UI and audit conventions |
| §11 deliverables | End of each phase |

## 6. Decisions needed from the founders

Each decision blocks the milestone shown. Until a decision is made, the milestone is built behind its interface with a mock adapter, so other work can continue. No sign-ups and no live keys will be added.

**D1: Payments and held funds (blocks 1.5, 1.15).**
The beta collects into Sleek's own Paystack balance, which the prompt forbids. Options:
- **Paystack:** strong collections, transfer, USSD and virtual accounts. Its split and subaccount features settle on a schedule, so it is not a true escrow; it would need to be paired with a licensed escrow or trustee partner.
- **Flutterwave:** collections, virtual accounts, split payments and international cards (useful for diaspora in Phase 2). Its escrow or settlement-hold terms need confirming with Flutterwave.
- **A licensed escrow or trustee partner, with a PSP for collection:** cleanest legally, but adds an integration and a fee.

Recommendation: talk to Paystack and Flutterwave about their hold and escrow products, and get a lawyer's view on the CBN position. Build against `PaymentProvider` so either one fits.

**D2: Identity, liveness and face match (blocks 1.8).**
Options: **Smile ID** (strong liveness, pan-African), **Prembly / IdentityPass** and **Dojah** (both Nigerian NIN/BVN coverage, and Dojah's pricing is developer-friendly), **Youverify**. Compare on NIN coverage, liveness quality on low-end phones and price per check.

**D3: Speech-to-text for chat voice notes and Go Live (blocks 1.9 voice, 1.18).**
Options: Me AI Model Labs (if ready), Google Cloud Speech-to-Text, Microsoft Azure Speech, or a self-hosted open speech model. Key test: Nigerian English and Pidgin with spoken digits.

**D4: Photo OCR and classification (blocks 1.9 photos).**
Options: Google Cloud Vision, AWS Rekognition with Textract, Azure AI Vision, or self-hosted OCR plus our own classifier later.

**D5: Maps and routing for tracking and ETA (blocks 1.10).**
Options: Google Maps Platform (best Lagos coverage and traffic, highest cost), Mapbox (lighter, good offline tiles), or OpenStreetMap-based (cheapest, weaker traffic data).

**D6: Media storage (blocks 1.8, 1.9, 1.12).**
A private bucket with signed URLs: AWS S3, Google Cloud Storage or Cloudflare R2 (no egress fees, good for photos).

**D7: Real-time voice for Go Live (blocks 1.18).**
Either the STT provider from D3 with our own dialogue logic, or a hosted real-time voice API.

**D8: SMS and WhatsApp (blocks 1.19 and production OTP).**
Options: Termii, Africa's Talking, Twilio, or WhatsApp Business through a provider.

**D9: Product conflicts (CURRENT_STATE §9).**
Approve the defaults proposed there:
- matching plus direct booking;
- Quotes replace the Price Pool;
- numbers unlock at `payment_held`;
- 10% commission;
- stage-based cancellation;
- Guarantee replaces Protection;
- Services, Teams and Ugent switched off for launch;
- a separate admin web app.

**D10: Launch zone and hosting.**
- Which zone launches first (for example Lekki–Ajah or Yaba–Surulere)?
- Where it runs: any container host with managed Postgres, daily backups and a staging copy.

## 7. Assumptions (applied unless you say otherwise)

- Default amounts, all from config:
  - booking fee ₦500;
  - guarantee reserve 20% of commission;
  - commission 10%;
  - auto-confirm 24/48/72h by job size;
  - dispute window equal to the auto-confirm window.
- Lagos time (Africa/Lagos) for all schedules.
- Admin staff sign in with email, password and TOTP. SSO comes later through the Me AI Console.
- Postgres stays the only datastore in Phase 1. Queues run on Postgres (`SKIP LOCKED`) rather than adding Redis, until load needs more.

## 8. Order of work and PRs

1. 1.0 Foundations
2. 1.1 Admin identity and API, with the 1.23 console shell
3. 1.2 State machine v2
4. 1.3 Zones
5. 1.4 Quotes
6. 1.6 Unlock rules
7. 1.5 Payments v2 (after D1)
8. 1.7 Matching
9. 1.8 Verification (after D2)
10. 1.12 Photo proof
11. 1.9 Screening (after D3, D4)
12. 1.11 Cancellations
13. 1.10 Tracking (after D5)
14. 1.13 Ratings, 1.14 Disputes and Guarantee, 1.15 Payouts
15. 1.16 Support, 1.17 Fraud
16. 1.19 Offline and SMS, 1.20 Legal
17. 1.21 Metrics, 1.22 Operations
18. 1.18 Go Live

1.24 (app wiring) runs alongside, one feature at a time.

**Waiting for approval before building anything.**
