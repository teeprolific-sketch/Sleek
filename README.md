# Sleek — by Me AI

**Trusted artisans. Protected payments.**
Sleek is a React Native (Expo) app that connects customers with verified artisans: mechanics, cleaners, electricians, tailors, photographers and 60 trades in all. Its trust rules are strict:

- **Escrow on every job.** The customer pays Sleek, never the artisan directly.
- **Chat stays in the app.** Phone numbers, emails, links and requests to deal off-app are blocked before they send.
- **Serious verification.** NIN, face liveness and face match, then a separate live video for each skill.
- **Address only after payment.** The artisan sees the exact address once escrow is funded.

<p align="center"><img src="assets/brand/sleek-logo.png" width="360" alt="Sleek logo"/></p>

## Quick start

```bash
npm install
npm start          # Expo dev server; press a / i, or scan with Expo Go
npm test           # domain rule tests (escrow, moderation, availability, ranking, verification)
npm run typecheck
npm run export:web # static web build in dist/
```

On the sign-in screen, pick a **demo account** to try every role:
Customer · Individual artisan · Team · Agency · Sleek admin. Any 6 digits work as the OTP in the demo build.

## What's inside

| Area | Screens |
| --- | --- |
| Onboarding | Splash, 4-step intro, phone + OTP sign-in, role picker (Customer / Artisan / Team / Agency) |
| Customer | Home (ranked, available-only artisans; Ugent entry), search ("available now" or "book for later" by day and time window), all 60 trades, artisan profile (badges, per-skill verification, reviews, trust score), booking request (time slots that respect availability, "photo of the issue" taken with the camera), chat with **Price Pool**, escrow payment (card / transfer to a one-time virtual account / USSD), job tracking, proof-of-work review and approval, ratings, disputes |
| Artisan | Dashboard (online toggle, On Job / Upcoming / Requests, escrow and balance, trust score), jobs and chats, proof-of-work upload, schedule (bookings by day plus weekly hours), earnings and payouts, verification hub (NIN, liveness, per-skill video), public profile editor, payout account |
| Team / Agency | Worker list, add a worker (each with their own NIN, liveness and skill videos), activate or deactivate, assign jobs to free verified workers, shared or individual calendars |
| Sleek Services | Separate shop for tools and materials (partner discounts) and rentals (cars, buses, generators, chairs, canopies, stages, cameras, PA, scaffolding), cart, delivery to the customer **or** the artisan (linked to a funded job, with a proximity tip), order tracking |
| Shared | Notifications, Trust & Safety centre, Help & Support (FAQ + tickets), settings (**White** (default, white & sky blue) / **Black** (black, white & light blue) / **Blue** (Sleek brand) themes, data saver, privacy) |
| Admin | Overview (escrow held, commission, repeat offenders), skill-video review queue (high-risk trades need a certificate check), dispute resolution (full chat, evidence, release / refund / split), rule-breaking monitor |
| Ugent | Connect screen showing exactly what the agent can and can't do, a chat console, and **confirmation cards for every booking, price change, payment and cancellation** |
| Trust & convenience (v2) | Shared **job timeline** (Booked → En route → Started → Proof → Approved → Paid), **Escrow Protected** badge and live auto-release countdown on every job, **Dispute Centre**, **saved artisans** and one-tap **rebook**, **job history** with filters, **tips** after release, **Sleek Protection** 7-day guarantee claims, **two-way reviews** (artisans rate customers), **more-time requests** with customer approval, **emergency/safety sheet** (alert Sleek, call 112, share with a trusted contact) |
| Matching (v2) | Saved **matching preferences** (gender where relevant, minimum rating, distance, price range, Trusted only, free today), search filters, and a **privacy-safe "Nearby" view** that shows area-level positions only |
| Artisan tools (v2) | **Earnings dashboard** (available, pending, total earned, commission, tips, payouts), **payout settings & schedules**, **day/week calendar** with **time off**, **performance insights**, detailed **team member management** (roles, notes, removal), **re-submission** screens with certificate upload, separate **Team/Agency onboarding** |
| System (v2) | **Notification settings** (per category, quiet hours; safety and money alerts can't be muted), **referrals** for customers and artisans, **English + Nigerian Pidgin** (Yoruba, Hausa, Igbo and French listed as coming soon), **offline/poor-network** handling (banner, queued chat, guarded actions), error and not-found screens, first-run tips, admin **safety queue** and **internal notes** |

## Project layout

```
src/
  app/          Expo Router routes (every file is a screen)
  components/   UI kit (light/dark), domain widgets, Logo
  domain/       Pure trust-rule logic, the single source of truth (unit tested)
  data/         60 categories, seed artisans/jobs, Sleek Services catalogue
  store/        Zustand store, a local stand-in for the backend; every action goes through domain rules
  services/     Payment and identity adapters (mock ⇄ production)
  ugent/        Agent tool definitions, executor, offline intent parser
  theme/        Brand palette, light and dark tokens
assets/brand/   Logo SVG/PNG set
docs/           Architecture, backend contract, Ugent integration, brand guide
```

Read next: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/BACKEND_CONTRACT.md](docs/BACKEND_CONTRACT.md) · [docs/UGENT.md](docs/UGENT.md) · [docs/BRAND.md](docs/BRAND.md)

## Backend

`server/` holds the API: Fastify + PostgreSQL. It imports `src/domain`, so the server enforces exactly the rules the app shows. It covers auth (phone OTP), jobs, chat moderation, the Price Pool, Paystack escrow with signed webhooks, refunds, payouts, verification, teams, Sleek Services orders, disputes, the admin console, the Ugent gateway, and a scheduler for auto-release, expiry and suspensions. 17 integration tests run against a real Postgres, including concurrent double-booking. See [server/README.md](server/README.md).

## Production status

The app still runs against its **local simulated backend**: the Zustand store with mock adapters. That keeps every flow demoable offline. The real API in `server/` is built and tested. What's left before launch:

1. **Point the app at the API.** Replace the store's local actions with calls to `server/` (the endpoints map 1:1; see `docs/BACKEND_CONTRACT.md`), and open the Paystack checkout URL for payments.
2. **Run Paystack in test mode** and register the webhook URL. The adapter is written, but it hasn't been run against a real Paystack test account yet.
3. **Plug in providers.** A NIMC-licensed KYC partner (`IdentityProvider`), an SMS OTP gateway, a private media bucket, and Expo push.
4. **Build for devices** (`npx expo run:android` or EAS Build). Camera recording and liveness need a real device.
