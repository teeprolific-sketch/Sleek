# Ugent integration

Ugent, the Me AI personal agent, books Sleek artisans through natural language. Sleek exposes a small, typed action surface (`src/ugent/actions.ts` → `UGENT_TOOLS`). It is written as JSON-schema tool definitions, so an LLM agent can call them directly.

## Actions
**Read-only (run immediately):** `list_categories`, `search_available_artisans`, `get_artisan_profile`, `check_artisan_skills`, `check_availability`, `get_job_status`, `list_my_jobs`.

**Require the user's confirmation in Sleek:** `initiate_booking`, `propose_price`, `request_escrow_funding`, `approve_job_completion`, `cancel_job`.
These return `{ status: "requires_confirmation", request_id, summary }`. The user sees a confirmation card in Sleek (`/ugent`) and also gets a push notification. Requests expire after 30 minutes.

## Guarantees
- Ugent works only after the user taps **Connect Ugent**, and only for customer accounts.
- Ugent never sees card details, contact details or exact addresses.
- `request_escrow_funding` only takes the user to the Sleek payment screen. The user always pays there themselves.
- Bookings made through Ugent carry `origin: "ugent"` and show "Booked via Ugent" to both sides. Every other rule (Price Pool, escrow, moderation, availability) applies unchanged.

## Wiring the real agent
1. Expose `POST /v1/agent/actions/:name` on the backend. It takes an OAuth token scoped `sleek.agent` that the user granted in Me AI, and calls the same executor logic.
2. Register `UGENT_TOOLS` with the Ugent model.
3. Deep link `sleek://ugent` opens the confirmation inbox.

The on-device `parser.ts` stands in for the LLM so the full flow can be demoed offline.
