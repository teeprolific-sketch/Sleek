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
| Shared | Notifications, Trust & Safety centre, Help & Support (FAQ + tickets), settings (System / Light / Dark theme, data saver, privacy) |
| Admin | Overview (escrow held, commission, repeat offenders), skill-video review queue (high-risk trades need a certificate check), dispute resolution (full chat, evidence, release / refund / split), rule-breaking monitor |
| Ugent | Connect screen showing exactly what the agent can and can't do, a chat console, and **confirmation cards for every booking, price change, payment and cancellation** |

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

## Production status

The app is complete end to end against a **local simulated backend**: the Zustand store plus mock payment and identity adapters. Data persists on the device so every flow can be demoed offline. Before launch, these pieces have to be real:

1. **Backend API.** It implements `docs/BACKEND_CONTRACT.md` and re-runs the same `src/domain` rules on the server. The client is never trusted for money, moderation or availability.
2. **Payments.** A licensed PSP (Paystack or Flutterwave) with an escrow or settlement account, webhooks and NUBAN name enquiry. Implement `PaymentGateway` in `src/services/payments.ts`.
3. **Identity.** A NIMC-licensed KYC provider (Smile ID, Prembly, Youverify or Dojah) for NIN lookup, liveness and face match, including on skill videos. Implement `IdentityProvider` in `src/services/identity.ts`.
4. **OTP over SMS/WhatsApp, push notifications, media storage** (encrypted, signed URLs), and a scheduled job on the server for auto-release.
5. A **development build** (`npx expo run:android`, or EAS Build). Camera recording and liveness need a real device.
