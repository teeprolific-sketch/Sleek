# Architecture

## Principles
- **The rules live in `src/domain`.** These are pure TypeScript functions with no React or I/O, covered by unit tests. The app uses them for instant UX, and the backend must run the same functions (shared package) to enforce them.
- **The client is never trusted.** Every action the store performs today (fund escrow, send message, lock price, release funds) maps 1:1 to an API endpoint that re-validates on the server.
- **Built for average Nigerian phones.** Only system fonts and vector icons (no image-heavy UI). Lists are virtualised. Camera captures use 0.4–0.6 JPEG quality. A data-saver setting is available. No web views, no maps SDK.

## Domain modules
| Module | Responsibility |
| --- | --- |
| `pricePool.ts` | Propose / counter / withdraw / accept. Only the *other* party can accept, and a locked price is immutable. Limits run from ₦1,000 to ₦50m. |
| `escrow.ts` | Job state machine, job size (short/normal/large), auto-release (24/48/72h), 10% commission (8% for Trusted), cancellation and refund policy, dispute settlement, location disclosure. |
| `moderation.ts` | Blocks phone numbers in digits, spaced or dotted forms, lookalike letters (O8O3l2…), and English/Yoruba/Igbo/Hausa number words, while allowing prices such as "150000 for 2 days". Also blocks emails (including "name at gmail dot com"), links, social handles, call or WhatsApp requests, and off-app payment (OPay, account number…). Returns a warning and a redacted excerpt for admins. |
| `availability.ts` | Overlap with a 30-minute travel buffer, working hours, per-worker capacity for teams and agencies, "available now" vs. bookable for a window. Future bookings only block their own window. |
| `ranking.ts` | Score = verification (30) + experience (20) + Bayesian rating (25) + reliability (15) + proof-of-work quality (10) − penalties. Search returns available artisans only. |
| `trust.ts` | Trust score 0–100, badges (Identity Verified, per-skill Verified, Trusted, Team/Agency). |
| `timeline.ts` | The single job timeline both sides see, including the halted states (cancelled, disputed). |
| `extensions.ts` | "More time" requests: limits, and clash checks against the worker's next booking. |
| `tips.ts`, `customerRating.ts` | Tip rules (after release, once, ₦200–₦50k, 100% to the artisan) and the artisan → customer rating. |
| `geo.ts`, `matching.ts` | Area-level distance (never exact location) and matching preferences applied on top of ranking. |
| `payouts.ts`, `referrals.ts`, `protection.ts` | Payout schedules, referral codes and qualification, and Sleek Protection eligibility and cover. |
| `insights.ts`, `notifications.ts` | Performance insights; notification categories, quiet hours, and alerts that can never be muted. |
| `verification.ts` | NIN format, ordered identity steps, randomised liveness challenges, automated skill-video gate (in-app, 30–180s, liveness, face match ≥ 0.80). High-risk trades go to human review plus a certificate check. |

## Job lifecycle
```
requested ──price locked──▶ price_agreed ──customer funds──▶ funded (Upcoming, address unlocked)
   │                              │                              │ artisan starts (≥ start − 1h)
   ▼                              ▼                              ▼
declined / cancelled         cancelled (free)               in_progress (On Job)
                                                                 │ proof uploaded
                                                                 ▼
                     disputed ◀── customer disputes ── proof_submitted (Pending Approval)
                        │                                       │ approve, or auto-release timer
                        ▼                                       ▼
                     resolved (release / refund / split)     completed (released − commission)
```

## Controlled uploads
There is no gallery or file picker anywhere. `utils/captureBus.ts` opens `/capture` for a named purpose (`issue_photo`, `site_before`, `proof_of_work`, `dispute_evidence`, `delivery_confirmation`). Photos are taken live, and each capture is logged with who took it, why and when (`uploadLog`). Android `READ_MEDIA_IMAGES` and `READ_EXTERNAL_STORAGE` are blocked in `app.json`, and so are `CALL_PHONE` and `READ_CONTACTS`.

## Security & privacy
- Only the last 4 digits of the NIN are kept on the device. Biometric captures go to the KYC provider via the backend and are then removed from the cache.
- Phone numbers are never shown to other users (`maskPhone`).
- Payouts only go to accounts whose name matches the verified identity.
- The session token belongs in `expo-secure-store` in production (wired as a plugin).
- NDPA 2023: data export and account deletion entry points live in Settings.

## Languages
`src/i18n` holds English (source) and Nigerian Pidgin. A missing key falls back to English, so a partly translated screen never breaks. Tabs, home, job status, timeline, escrow, chat warnings, Dispute Centre, safety, empty states, network and error states are translated. Yoruba, Hausa, Igbo and French are listed as "coming soon".

## Offline & poor network
`useNetworkWatcher` (NetInfo) feeds `store.network`. A banner explains what still works. Chat messages written offline go to an outbox and send automatically when the connection returns. Money and state-changing actions refuse with a clear message instead of failing silently. Settings → Demo → "Simulate no network" lets you try it.

## Theming
`src/theme` defines light and dark palettes from the brand colours (#0EA5E9 sky, #0B3D91 deep, #FFFFFF). Every component reads `useTheme()`. The mode can be System, Light or Dark and is persisted.
