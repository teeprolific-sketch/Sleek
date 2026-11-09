# Sleek API

Node + TypeScript (Fastify) + PostgreSQL. It runs **the same trust rules as the app**: it imports `../src/domain` directly, so escrow, the Price Pool, chat moderation, availability, ranking and verification can never drift between client and server.

## Run locally

```bash
cd server
npm install
cp .env.example .env    # dev defaults work without it (mock payments, local Postgres)
npm run migrate
npm run seed            # demo artisans, demo customer (0800 000 0001) and admin; dev/staging only
npm run dev             # http://localhost:8080 — scheduler runs inside the process
npm test                # integration tests against a real Postgres (TEST_DATABASE_URL)
```

In development, `POST /v1/auth/otp` returns a `devCode`. `POST /v1/dev/payments/:reference/complete` simulates a customer finishing Paystack checkout by sending a correctly signed webhook. Both are disabled in production.

## How money moves
1. `POST /v1/jobs/:id/escrow` checks that the price is locked and the slot is free, records a pending payment and returns a Paystack checkout URL.
2. The customer pays in Paystack checkout (card / bank transfer / USSD).
3. Paystack calls `POST /v1/webhooks/paystack`. The server checks the HMAC-SHA512 signature, **re-verifies the charge with Paystack** and checks the amount against the locked price. Then, in one transaction that holds a row lock on the artisan, it re-checks capacity. If the slot is still free, the job becomes `funded` and the address is unlocked. If someone else took the slot in the meantime, the payment is **refunded automatically**.
4. Release happens on customer approval or by the scheduler's auto-release (24/48/72h). It writes a ledger credit. A unique `(job_id, type)` index makes a double release impossible.
5. Cancellations and dispute outcomes refund the original charge through Paystack. If a refund fails, admins are alerted.
6. A payout is a ledger debit plus a Paystack transfer to a recipient whose account name matched the verified identity. A failed transfer webhook credits the money back.

## Scheduler (every minute, one instance at a time via a Postgres advisory lock)
- Auto-release proof-of-work jobs whose window has passed
- Cancel `price_agreed` jobs that weren't paid within 24h
- Expire Ugent confirmation requests after 30 minutes
- Auto-suspend users with 5+ blocked off-app attempts in 30 days

## Providers
| Concern | Adapter | Status |
| --- | --- | --- |
| Payments | `providers/payments.ts`: `PaystackGateway`, `MockGateway` | Paystack adapter written against Paystack's REST API (initialize, verify, refund, bank resolve, transfer recipient, transfer, webhooks). **Not yet run against a Paystack test account.** |
| Identity / KYC | `providers/identity.ts`: `MockIdentity` | Needs a NIMC-licensed partner (Smile ID, Prembly, Youverify, Dojah). Implement `IdentityProvider`. |
| SMS OTP | `providers/sms.ts`: `ConsoleSms` | Needs Termii / Africa's Talking / WhatsApp OTP. |
| Media storage | `providers/storage.ts`: `MockStorage` | Needs a private bucket with signed PUT/GET URLs (S3/GCS/R2). |
| Push notifications | `repo.notify` | Writes in-app notifications. Add Expo push sending there. |

## Deploy

```bash
docker build -f server/Dockerfile -t sleek-api .
```

Then run the image with the variables from `.env.example`, behind HTTPS. Set the Paystack webhook URL to `https://<host>/v1/webhooks/paystack`.
