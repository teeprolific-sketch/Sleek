# Backend contract

> **Implemented** in `server/` (see `server/src/app.ts` for the exact routes and request schemas). The table below maps each endpoint to the app store action it replaces.

The mobile store (`src/store/index.ts`) is a faithful local implementation of the following API. Each endpoint **must** re-run the matching `src/domain` function on the server. All amounts are whole Naira. Auth is a phone OTP that returns a JWT. The admin role requires SSO + 2FA.

| Method & path | Store action | Server-side rule |
| --- | --- | --- |
| `POST /v1/auth/otp`, `POST /v1/auth/verify` | `register`, `signInDemo` | Rate-limited, Nigerian MSISDN only |
| `GET /v1/artisans/search?category&city&start&end` | `searchAvailable` | Available only, ranked by `rankScore` |
| `GET /v1/artisans/:id` | — | Public fields only, never phone or exact address |
| `POST /v1/jobs` | `createJob` | `bookableFor` must be ok, customer role |
| `POST /v1/jobs/:id/messages` | `sendMessage` | `moderateMessage`. On a block, return 422, log a `RuleViolation` and lower trust |
| `POST /v1/jobs/:id/price-offers` | `proposePrice` | `pricePool.propose` |
| `POST /v1/jobs/:id/price-offers/accept` | `acceptPrice` | `pricePool.accept`, then `classifyJobSize` |
| `POST /v1/jobs/:id/escrow` → PSP checkout | `fundEscrow` | `canFund`, re-check worker capacity, **mark funded only from the PSP webhook** |
| `POST /v1/jobs/:id/assign` | `assignWorker` | Worker skill-approved and free |
| `POST /v1/jobs/:id/start` | `startJob` | `canStart` |
| `POST /v1/media` (purpose, jobId) | `logCapture` | Signed upload, purpose allow-list, audit log |
| `POST /v1/jobs/:id/proof` | `submitProof` | `canSubmitProof`, sets `autoReleaseAt` |
| `POST /v1/jobs/:id/approve` | `approveJob` | `release`, ledger credit |
| `POST /v1/jobs/:id/cancel` | `cancelJob` | `quoteCancellation` / `applyCancellation`, PSP refund |
| `POST /v1/jobs/:id/disputes` | `openDispute` | `canDispute`, escrow → frozen |
| `POST /v1/disputes/:id/resolve` (admin) | `resolveDispute` | `resolveDisputeEscrow` |
| `POST /v1/jobs/:id/reviews` | `submitReview` | Completed or resolved job, one per job |
| `POST /v1/verification/nin` | `verifyNIN` | KYC provider lookup |
| `POST /v1/verification/liveness` | `completeLiveness` | Challenge IDs issued by the server, liveness + face match ≥ 0.85 |
| `POST /v1/verification/skills` | `submitSkillVideo` | `checkSkillVideo`, then human review queue |
| `POST /v1/admin/skills/:id/decision` | `reviewSkill` | High-risk requires certificate |
| `POST /v1/team/workers` | `addWorker` | Team or agency only |
| `POST /v1/payouts` | `requestPayout` | Balance from ledger, verified account |
| `POST /v1/orders` | `placeOrder` | Artisan delivery needs a funded job |
| `POST /v1/agent/actions/:name` | `executeUgentAction` | See UGENT.md |

## Scheduled jobs (server)
- Every 5 minutes: run `dueForAutoRelease` and release funds; send reminders at 50% and 90% of the window.
- Expire unpaid `price_agreed` jobs after 24h, which frees the slot.
- Expire Ugent confirmation requests after 30 minutes.
- Auto-suspend accounts with 5 or more rule violations within 30 days, pending admin review.

## v2 endpoints

| Method & path | Store action | Server-side rule |
| --- | --- | --- |
| `GET /v1/jobs?filter=completed\|cancelled\|disputed\|active` | History screen | Own jobs only |
| `POST /v1/jobs/:id/en-route` | `markEnRoute` | `canMarkEnRoute` |
| `POST /v1/jobs/:id/extensions` / `.../extensions/decision` | `requestExtension` / `decideExtension` | `validateExtension`, `extensionClashes` under the artisan lock |
| `POST /v1/jobs/:id/tip` → webhook | `addTip` | `validateTip`, credited only from a verified PSP charge, one per job (ledger unique index) |
| `POST /v1/jobs/:id/customer-review` | `rateCustomer` | `validateCustomerReview`, once per job |
| `POST /v1/jobs/:id/protection-claims`, `POST /v1/admin/protection-claims/:id` | `submitGuaranteeClaim` / `decideGuaranteeClaim` | `protectionEligible`, 7-day window, payout capped by `protectionCover` |
| `POST /v1/disputes/:id/evidence` | `addDisputeEvidence` | Own, unused `dispute_evidence` media only |
| `POST /v1/safety/alerts`, `GET/POST /v1/admin/safety` | `raiseSafetyAlert` / `updateSafetyAlert` | Admins are notified on the `safety` category, which can't be muted |
| `PUT/DELETE /v1/me/favourites/:id`, `GET /v1/me/favourites` | `toggleFavourite` | — |
| `PUT /v1/me/preferences`, `GET /v1/me/search` | `setMatchingPrefs`, search | `applyPreferences` on top of `searchAvailable` |
| `PUT /v1/me/trusted-contact` | `setTrustedContact` | Nigerian mobile only, never shown to artisans |
| `GET/PUT /v1/me/notification-preferences` | `setNotificationPref` / `setQuietHours` | `shouldPush` decides `silent` on every notification |
| `GET /v1/me/referrals`, `referralCode` on register | `register`, referrals screen | Reward when `referralQualifies` (inside the release transaction) |
| `POST/DELETE /v1/artisan/time-off` | `addTimeOff` | Can't cover a funded job, and `bookableFor` respects it |
| `PUT /v1/artisan/payout-schedule` | `setPayoutSchedule` | Scheduler runs `autoPayoutDue` |
| `PUT /v1/artisan/business` | `completeBusinessOnboarding` | Agencies need a CAC number |
| `PATCH/DELETE /v1/team/workers/:id(/details)` | `updateWorker` / `removeWorker` | Can't remove a worker with active jobs |
| `POST /v1/verification/skills/:id/certificate` | `submitCertificate` | Own, unused `certificate` media |
| `GET /v1/artisan/insights` | Insights screen | `artisanInsights` |
| `GET /v1/admin/notes/:type/:id`, `POST /v1/admin/notes` | `addAdminNote` | Admin-only, never returned to users |
