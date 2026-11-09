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
