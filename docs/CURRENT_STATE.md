# Sleek: current state (beta)

Written 28 November 2026 against branch `claude/sleek-artisan-marketplace-app-pwem54` (commit `1667371`), as Section 0 of the master build prompt. It compares what is in the repo today with that prompt.

## 1. Summary

Sleek has two well-tested halves that **are not yet connected**:

- **The mobile app** (Expo / React Native) covers almost every screen a customer, an artisan, a team/agency and an admin need. It runs entirely on a local demo store (Zustand + AsyncStorage + seed data). It never calls the API.
- **The API** (Fastify + Postgres) implements the core trust rules for real: OTP login, jobs, price agreement, Paystack escrow with verified webhooks, release, refunds, disputes, payouts, chat screening, reviews, safety alerts, referrals and an Ugent gateway. Its payment adapter has not been run against a real Paystack test account.

Both halves share one rules layer (`src/domain`), so the app and the server cannot disagree about escrow, screening, availability or ranking.

Measured against the master prompt, the biggest gaps are:

1. The app is not wired to the API.
2. There are no zones, matching offers, quotes with a breakdown, booking fee, arrival state or live tracking.
3. Business rules are hard-coded constants, not admin settings.
4. Money is whole naira with no currency code.
5. The admin is a role inside the mobile app, not a separate, locked-down console.
6. Photos and voice notes are not screened (there are no voice notes yet).
7. Production has no logging, monitoring or general rate limiting.

## 2. Stack

| Layer | What is used |
| --- | --- |
| Mobile app | Expo SDK 58, React Native 0.88, React 19, expo-router (file routes in `src/app`), TypeScript 6 |
| App state | Zustand with `persist` to AsyncStorage (store version 3, with migrations) |
| Rules layer | `src/domain/*.ts`: pure TypeScript with no I/O, shared by the app and the server |
| Backend | Node 20+, Fastify 5, zod validation, `pg` (no ORM), `tsx` runtime, own HS256 JWT |
| Database | PostgreSQL 16. Plain SQL migrations in `server/migrations` (001, 002) |
| Payments | `server/src/providers/payments.ts`: `PaystackGateway` (written, untested against Paystack) and `MockGateway` |
| Identity / SMS / storage | Interfaces with mock implementations only (`providers/identity.ts`, `sms.ts`, `storage.ts`) |
| Background work | In-process scheduler, run every minute under a Postgres advisory lock (`server/src/scheduler.ts`) |
| Hosting | `server/Dockerfile` only. There is no CI, no infrastructure-as-code and no staging definition |
| Web preview | `expo export --platform web` with `EXPO_PUBLIC_DEMO=1` (demo data, simulated camera) |
| AI services | None external. Chat screening and the Ugent intent parser (`src/ugent/parser.ts`) are rule-based |

## 3. Folder map

```
src/
  app/          expo-router screens (customer, artisan, admin, team, chat, job, escrow, verify, ...)
  components/   UI kit (ui.tsx), job parts, maps placeholder, feedback, logo
  domain/       the business rules plus tests (escrow, pricePool, moderation, ranking, availability,
                verification, trust, timeline, protection, payouts, referrals, tips, ...)
  store/        the Zustand store: the whole demo backend in the client
  data/         seed data, categories (60 trades)
  i18n/         English plus Nigerian Pidgin
  services/     client-side payment and identity adapters (mocks)
  ugent/        Ugent intent parser and actions
  theme/        White / Black / Blue themes
server/
  src/app.ts    every route (no separate routes folder; src/routes is empty)
  src/services/ jobs, artisans, features, admin, agent (Ugent), misc (orders, media)
  src/providers payments, identity, sms, storage
  migrations/   001_init.sql, 002_features.sql
  test/         integration tests against a real Postgres
docs/           ARCHITECTURE, BACKEND_CONTRACT, BRAND, UGENT
```

## 4. What exists

### Data model (server)

Domain objects are stored as **JSONB documents** that mirror `src/domain/types.ts`. Indexed columns are added only for what gets filtered or locked.

| Table | Holds |
| --- | --- |
| `users` | Customers, artisans and admins, in one table with a `role` column |
| `otps` | OTP codes |
| `jobs` | Jobs (`customer_id` and `artisan_id` are both required, so an artisan is chosen at creation) |
| `messages` | Chat messages |
| `violations` | Blocked off-app attempts |
| `disputes`, `reviews`, `customer_reviews` | Disputes, reviews of artisans, artisans' reviews of customers |
| `notifications` | In-app notifications |
| `ledger` | Append-only artisan money ledger; a unique `(job_id, type)` index stops double release |
| `payments` | Every PSP charge, refund and transfer, keyed by reference (this makes webhooks idempotent) |
| `payouts`, `orders` | Artisan payouts; Sleek Services orders |
| `media` | Who uploaded what, for which purpose, and when |
| `liveness_sessions` | Identity liveness sessions |
| `agent_requests` | Ugent confirmation requests |
| `audit_log` | Admin and system actions |
| `safety_alerts`, `referrals`, `guarantee_claims` | Safety button alerts, referrals, Sleek Protection claims |
| `admin_notes` | Staff notes on users and jobs |

### Job lifecycle (today)

`requested → price_agreed → funded → in_progress → proof_submitted → completed`

Side branches: `disputed → resolved`, `cancelled`, `declined`. The transitions are enforced on the server by the domain functions, and every job carries an in-document `timeline` array.

### Features that work end to end on the server (with tests)

- **Login and sessions:** phone OTP login, with limits on codes per hour and on wrong attempts. The `devCode` shortcut is disabled in production.
- **Price agreement:** the "Price Pool". Either side can offer or counter; only the other side can accept; once locked, the price cannot change.
- **Escrow funding:** a Paystack checkout. The webhook's HMAC-SHA512 signature is checked, the charge is **re-verified with Paystack**, and the amount is checked against the locked price. Funding takes a row lock and re-checks capacity; if someone else took the slot, the payment is refunded automatically.
- **Address privacy:** the address is hidden from the artisan until escrow is funded (`jobView`).
- **Release:** on approval, or by auto-release after 24, 48 or 72 hours depending on job size. A commission of 10% (8% for Trusted artisans) is written to the ledger.
- **Cancellation, refunds and disputes:** cancellation quotes and refunds. Disputes take evidence and a response, and an admin resolves them as release, refund or a split.
- **Payouts:** Paystack transfers to an account whose name matches the verified identity. A failed transfer credits the money back.
- **Chat screening:** catches phone numbers in digits, spaced, dotted, lookalike-letter and number-word forms (English, Yoruba, Igbo and Hausa words). It also catches emails including "at gmail dot com", links, handles, call or WhatsApp requests, off-app payment, and numbers **split across messages**. After 5 blocked attempts in 30 days the account is suspended automatically.
- **After the job:** two-way reviews, tips, "more time" requests, the safety button (alerts admin), a trusted contact, referrals, and Sleek Protection claims (7 days, ₦50k cap).
- **Ugent gateway:** scoped agent tokens that can be revoked, a tool list, and confirmation requests that expire after 30 minutes.
- **Admin endpoints:** metrics, verification queue, disputes, safety alerts, violations, suspensions and notes.

### App-only features (demo store, no server yet)

- Onboarding.
- Identity verification UI: NIN, randomised liveness challenges, and per-skill in-app video with a face-match gate.
- Team/agency accounts with workers.
- Availability with a 30-minute travel buffer.
- Ranking and search.
- Sleek Services shop and rentals.
- Favourites, rebooking, history, earnings, payout settings, notification settings, insights.
- Offline banner and a chat outbox.
- Three themes, English and Pidgin.
- Controlled uploads: camera only, no gallery.

### Tests

| Suite | Result |
| --- | --- |
| App (`npm test`, jest) | 4 suites, **122 tests passing** |
| Server (`cd server && npm test`, real Postgres) | **29 tests passing** |
| Type checks (`tsc --noEmit`, app and server) | Clean |
| Secrets scan of the full git history (live and test API keys, private keys, cloud and GitHub tokens) | **Nothing found** |

## 5. Half-built

| Area | State |
| --- | --- |
| App ↔ API | Not connected. `src/store/index.ts` (1,239 lines) re-implements the backend locally. `docs/BACKEND_CONTRACT.md` maps store actions to endpoints, but there is no API client. |
| Paystack | The adapter is complete on paper but has not been run against a Paystack test account. |
| Identity / KYC | `MockIdentity` only. The provider has not been chosen. |
| SMS | `ConsoleSms` only. Push notifications are in-app records only (no Expo push). |
| Media | `MockStorage`. Uploads record metadata, but no files are stored. |
| Admin | Admin screens live **inside the mobile app** (`src/app/admin`, `safety-queue`, `trust-safety`, `review-skill`, `resolve`). The server has 14 admin routes under `/v1/admin`. |
| Maps | `NearbyMap` is a schematic placeholder. `docs/ARCHITECTURE.md` says "no maps SDK" on purpose. |
| Seeds | The server seed loads the app's demo dataset. There is no demo **zone**, because zones don't exist yet. |

## 6. Missing compared with the master prompt

Grouped by section. A ✱ marks items where the current behaviour **conflicts** with the prompt, so a decision is needed (see section 9).

- **§3 Data model:** no Zone, ConfigSetting, feature flags, Quote / QuoteChangeRequest, EscrowHold (as its own record), Refund (as its own record), SkillProof (as its own table), VerificationRecord, Guarantor, PriceRange, ScreeningResult, GoLiveSession, LocationPing, TrackingSession, JobPhoto (with stages), SupportTicket, FraudSignal, Plan / Subscription / PlanVisit, Partner, Promo, AdminUser / AdminRole, or job event log table.
  - ✱ Money is whole naira with no currency column. The prompt wants kobo plus a currency code.
- **§4 State machine:**
  - States that don't exist yet: `matching`, `quoted`, `artisan_en_route` (only an "en-route" ping exists), `arrived`, `payout_released`, `quote_change_requested`, `artisan_no_show`, `customer_no_show`.
  - Our `funded` maps to `payment_held` and `proof_submitted` to `awaiting_confirmation`.
  - Before-photos are not required to start.
- **§5.1 Zones:** none. `users.city` is free text, and there is no waitlist.
- **§5.2 Onboarding:**
  - ✱ Skills are proven by an automated in-app video gate. There is no timed assessment, quiz, portfolio review, probation, guarantor, digital ID card or QR verification page.
  - The badge levels differ: today they are Identity Verified, per-skill Verified, Trusted and Team/Agency.
- **§5.3 Booking:**
  - ✱ The customer picks an artisan directly (`artisan_id` is required).
  - There is no ₦500 booking fee, no Go Live voice assistant and no landmark field.
  - Price ranges are only artisans' "starting prices".
- **§5.3a Screening:**
  - Text screening is strong.
  - Missing: voice notes and their transcription, photo OCR/classification, a review queue for borderline items, appeals, and configurable thresholds.
  - ✱ Phone numbers are **never** shared, even after payment. The prompt unlocks both numbers at `payment_held`.
- **§5.4 Matching:** ranking exists (`ranking.ts`, `matching.ts`). Missing: offers to artisans with an acceptance timeout, fallback, an ops alert when nobody is matched, time-to-match metrics, and logging of matching features and outcomes.
- **§5.5 Quotes:** ✱ the Price Pool is a single number. There is no labour/materials breakdown, no fixed-price jobs and no mid-job quote change with a top-up.
- **§5.6 Payments:**
  - ✱ Funds sit in Sleek's own Paystack balance and are paid out with `source: 'balance'`. The prompt says Sleek must not hold customer funds itself.
  - There is no booking fee, no virtual-account bank transfer flow, no second provider and no daily reconciliation.
- **§5.7 Payouts:** manual, triggered by the artisan. There is no automatic same-day payout on completion and no cooling-off when payout details change.
- **§5.8 Guarantee:** ✱ "Sleek Protection" (7 days, ₦50k cap) exists. There is no 20%-of-commission reserve ledger and no "redo with another artisan".
- **§5.9 / 5.10 Safety and tracking:**
  - The safety button, trusted contact, gender preference and en-route ping exist.
  - There is no live two-way map tracking, no arrival check-in with a distance check, no "meet me here" and no lateness detection.
  - The emergency button shows no emergency numbers, and the trusted contact has no live share link.
- **§5.11 Cancellations:** ✱ the fee depends on time to start (≥24h free, otherwise 10% to the artisan), not on the job's stage. There are no no-show states.
- **§5.12 Photos:** proof of work exists. There is no stage tagging (before/during/after), no requirement for before-photos, and no marketing-consent flag.
- **§5.13 Ratings:** two-way ratings exist. They are not blind: neither side should see the other's rating until both are in.
- **§5.14 Disputes:** exist. Missing: chat attached automatically as evidence, a dispute window from config, SLA timers and a written playbook.
- **§5.15 Support:** a help screen only. No tickets and no WhatsApp link.
- **§5.16 Fraud:** only the off-app suspension rule exists. No device fingerprint, FraudSignal queue, promo velocity rules or collusion signals.
- **§5.17 Offline:** a chat outbox and network banner exist. Check-ins, photos and status changes are not queued, there is no idempotency key on mutating endpoints, and there is no SMS fallback.
- **§5.18 Languages:** English and Pidgin exist. Yoruba, Igbo and Hausa are "coming soon". No speech-to-text.
- **§5.19 Legal and privacy:** export and delete entry points exist in Settings. Missing: versioned terms with recorded acceptance, retention jobs, and a privacy-request workflow.
- **§5.20 Analytics:** `/v1/admin/metrics` returns basic counts. No event pipeline, no GMV vs revenue split, no funnels.
- **§5.21 Engineering:** no CI, monitoring, alerting, structured production logs, backup/restore runbook, incident playbook or staging environment.
- **§6 and §7:** none of it, except partial referrals and an Ugent integration that is **already built**. The prompt places Ugent "only after Sleek is stable" (§6.15).
- **§9 Admin console:**
  - ✱ Admins are ordinary users with `role = 'admin'`. They use the same OTP login and the same JWT (30-day session) with no 2FA, have a single all-powerful role, see unmasked data, and give no reasons for their actions.
  - About 13 actions write to `audit_log`. There is no separate admin API namespace and no maker-checker approval.

## 7. Obvious bugs and security risks

Ordered by severity.

1. **No logging in production.** `Fastify({ logger: env === 'development' ? … : false })` turns logs off outside development, so production failures would be invisible. There are no request IDs and no redaction rules.
2. **Admin access is too broad and too weak.** It is phone-OTP only, with no 2FA, one role, 30-day tokens, unmasked phone numbers and addresses, and no reason required for sensitive actions. One SIM-swap gives full admin control.
3. **Customer funds sit in Sleek's own PSP balance** between charge and payout. This is a regulatory risk under the prompt's own rule. It needs a licensed hold, escrow or split product, and legal sign-off.
4. **No general rate limiting.** Only OTP requests are limited. Booking, chat, offers and webhooks are not.
5. **Mutating endpoints are not idempotent.** A network retry can double-submit offers, messages or check-ins. Payments are protected by reference; other actions are not.
6. **Long-lived tokens.** User sessions last 30 days and agent tokens 180 days. Suspension is checked on every request, but there is no per-session revocation or refresh rotation for user tokens.
7. **Uploads aren't real or checked.** `MockStorage` stores nothing, and nothing checks content type or size for media, or screens photos for contact details.
8. **The client holds the whole demo database.** All users and jobs live in AsyncStorage on the device. That is fine for the demo, but it must never be the production data path.
9. **Hard-coded business rules:**
   - commission 10% / 8% (`escrow.ts`);
   - auto-release 24/48/72 hours;
   - Protection 7 days / ₦50k / ₦300k;
   - cancellation 24 hours / 10%;
   - off-app suspension at 5 attempts in 30 days;
   - the price limit of ₦1,000 to ₦50m.

   All of these need to move to config.
10. **Money precision.** Amounts are whole naira, with ×100 conversion at the Paystack boundary. That is safe today, but it can't represent kobo fees, foreign currency or FX.
11. **Smaller items:**
    - `trustProxy: true` trusts any `X-Forwarded-For`. That's acceptable only behind a known proxy, and it matters for IP-based region signals later.
    - There is no CORS policy (fine for mobile, needed for the admin web app).
    - `src/routes/` is empty and all 90 routes sit in one 385-line `app.ts`.

No secrets were found in the code or the git history. `.env` files are git-ignored, and `server/.env.example` holds placeholders only.

## 8. Technical debt

- **JSONB documents** for jobs and users make reporting, constraints and the new relational entities hard. Recommendation: keep the documents, and add typed tables or columns for anything that needs constraints, joins, money or reporting. Don't do a big-bang rewrite.
- **Business logic exists twice.** It lives in the server services and in the client store. Once the app talks to the API, the store's "backend" code should be deleted and the store becomes a cache.
- **One routes file.** Split `server/src/app.ts` into route modules (customer, artisan, admin, partner, webhooks).
- **Scheduler inside the API process.** Fine for one instance; it should become a separate worker as load grows.
- **Features outside the prompt's scope**, to keep behind flags: Sleek Services (shop and rentals), team/agency accounts and the Ugent gateway.
- **"No maps SDK".** This rule in `ARCHITECTURE.md` must be revisited for §5.10 tracking. A lightweight, low-data map is still possible.

## 9. Conflicts that need a founder decision

These are not bugs. The current beta made a choice the prompt changes. The plan assumes the **prompt wins** unless you say otherwise.

| # | Today | Prompt | Proposed |
| --- | --- | --- | --- |
| 1 | Customer picks an artisan, then they negotiate a single price (Price Pool) | Matching sends the job to artisans in ranked order; the artisan sends a quote (labour + materials) | Keep "Book [name]" for direct and repeat bookings, and add "Find me someone" matching. Replace the Price Pool with Quotes; a customer counter-offer becomes "ask for a revised quote". |
| 2 | Phone numbers are never shared | Both numbers unlock at `payment_held` | Follow the prompt. Use number masking or relay calls later if possible. |
| 3 | Commission 10% (8% for Trusted) | Configurable | Default 10%. Keep a "Trusted" override as a config rule. |
| 4 | Auto-release after 24/48/72h by job size | Configurable auto-confirm window | Keep the size-based defaults as config values. |
| 5 | Cancellation by time to start | By job stage | Stage-based, as in the prompt, with the current numbers as starting defaults. |
| 6 | Sleek Protection (7 days, ₦50k cap) | Sleek Guarantee, funded by 20% of commission | Rename to Sleek Guarantee and fund it from the reserve ledger. Keep the cap and window as config. |
| 7 | Sleek Services, team/agency accounts, Ugent are live in the app | Not in Phase 1 (Ugent is §6.15) | Keep the code, behind feature flags, **off** for the launch zone. |
| 8 | Admin lives inside the mobile app | Separate web console behind `/admin/v1` | Build `admin/` as a separate React + TypeScript web app. Remove admin screens from the mobile app once it reaches parity. |
| 9 | Money held in Sleek's Paystack balance | Licensed partner's hold, escrow or split | Needs a provider and legal decision (see the plan, decision D1). |

The full list of choices, including which providers to use, is in section 6 of `docs/IMPLEMENTATION_PLAN.md`.
