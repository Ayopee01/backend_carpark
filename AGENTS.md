# AGENTS.md

This file is the working guide for Codex or any future coding agent in this
repository. Treat the source code as the final authority, then use this guide as
the project-level intent and convention reference.

## Project Overview

Smart-carpark-API is a Node.js 20, Express, Prisma, and PostgreSQL backend for a
smart carpark system. It serves admin users, LPR/camera transaction ingestion,
kiosk and barrier-gate clients, mobile QR payment clients, dashboards, config
screens, OpenAPI docs, and Postman collections.

Important entry points:

- `src/server.js` starts the HTTP server.
- `src/app.js` wires middleware and route mounting order.
- `src/docs/openapi.js` is the maintained OpenAPI schema.
- `prisma/schema.prisma` defines the persistent tables.
- `prisma/seed.js` defines default users, config, devices, channels, and sample
  transactions.
- `src/data/repositories/*.repo.js` own most persistence and business behavior.
- `src/routes/*.routes.js` keep route-facing request/response shape.
- `test/*.test.js` contains focused Node test runner tests.

## Route Mounting And Auth

`src/app.js` mounts public/client routes before admin auth:

- `GET /health` and `GET /docs/openapi.json` are public.
- `/api/v1/client` is mounted before `authMiddleware`.
- `/api/v1/devices` has a public client config route before `authMiddleware`.
- Admin routes are mounted after `authMiddleware` and then use permission checks.

Admin route permissions are enforced with `authorize(...)`:

- `transactions` permission for `/api/v1/transactions`.
- `pricing` permission for `/api/v1/service-pricing` and
  `/api/v1/payment-settings`.
- `devices` permission for admin device management.
- `theme` permission for `/api/v1/theme`.
- `settings` permission for `/api/v1/system-settings`.

## Client, Mobile, Kiosk, And Barrier-Gate Flow

Keep the existing client source rule because it is simple and intentional:

- If a request supplies `deviceId`, resolve it as a registered device.
- If the device is `kiosk`, the client type is `kiosk`.
- If the device is `barrier_gate`, the client type is `barrier_gate`.
- If no `deviceId` is supplied, treat the request as mobile.

This rule lives in `src/routes/client.routes.js` in `resolveClientSource()`.
Do not add a separate public/mobile endpoint or a new payment token unless the
user explicitly asks for that requirement. The current mobile QR flow uses the
transaction id in `qrData`, currently `/payment?tx=<transactionId>`.

Device credential behavior:

- Activated kiosk/barrier devices receive a `deviceId` and `deviceToken`.
- `POST /api/v1/client/check-in` requires device credentials via
  `requireDeviceAuth(['kiosk', 'barrier_gate'])`.
- `GET /api/v1/client/events` allows public SSE when no `deviceId` is present,
  and requires device credentials when `deviceId` is present.
- Transaction lookup/payment client endpoints currently identify kiosk/gate by
  `deviceId`; do not silently change this contract without checking the frontend
  impact.

## Payment Channel Rules

Client payment channel is derived from client source:

- `barrier_gate` device -> payment channel `gate`.
- `kiosk` device -> payment channel `kiosk`.
- no `deviceId` -> payment channel `mobile`.

Therefore mobile QR payment should not send `deviceId`. When it omits
`deviceId`, the backend stores the payment channel as `mobile` and
`processedBy` as `mobile_user`.

Seeded payment setting channels are:

- `ch_cashier`
- `ch_kiosk`
- `ch_mobile`
- `ch_gate`

`processPayment()` validates method/channel through
`validatePaymentSelection()` before saving. Keep this validation path intact.

Payment update behavior:

- Non-gate payments set `exitTimeLimit` to the payment expiry window and mark the
  transaction `paid_waiting_exit` or `partially_paid` based on total paid.
- Gate payments set `exitTimeLimit`, `exitAt`, and `status: completed`
  immediately.

## Transaction Flow

Camera/LPR transaction creation uses the admin transaction route:

- `POST /api/v1/transactions`
- Requires admin auth and `transactions` permission.
- Validates through `validateCameraTransactionPayload()`.
- Creates or updates through `createTransactionFromCamera()`.

Core transaction repository behavior:

- Plate numbers are normalized by trimming spaces and hyphens.
- `getTransactionByIdOrPlateNo()` tries id first, then latest matching plate.
- Payable lookups avoid terminal statuses when requested.
- API transaction responses calculate current pricing through `calculateFee()`.
- `qrData` points the frontend to mobile payment using the transaction id.
- `paid_waiting_exit` means the fee is fully paid and the vehicle must leave
  before `exitTimeLimit`; `completed` means the vehicle has exited and the
  transaction is finished.
- `direction: "OUT"` must not close a transaction after `exitTimeLimit` has
  expired. The gate/camera flow should return a payment-required response so the
  driver pays the newly calculated amount before exiting.

## Admin Config Endpoint Convention

For config-style APIs, preserve this project convention unless the user clearly
asks for a different API contract:

- GET routes are the inspection surface and should return the useful data plus
  `configUpdatedAt` where supported.
- Mutation routes should return short success/failure acknowledgements.
- Do not churn the stored `app_config` shape when a route-facing response change
  is enough.
- Keep OpenAPI docs in `src/docs/openapi.js` synced with route contracts.

Examples already following this convention:

- `GET /api/v1/payment-settings/methods`
- `GET /api/v1/payment-settings/channels`
- `PATCH /api/v1/payment-settings/methods/:id`
- `PATCH /api/v1/payment-settings/channels/:id`
- `GET /api/v1/system-settings`
- `GET /api/v1/system-settings/receipt`
- `PUT /api/v1/system-settings`
- `PUT /api/v1/system-settings/receipt`
- `GET /api/v1/service-pricing/config`
- `PUT/POST/PATCH/DELETE /api/v1/service-pricing/config`

## Pricing Rules

Pricing is implemented in `src/utils/pricing.js` and covered by
`test/pricing.test.js`. Preserve rule-driven pricing rather than adding
hard-coded special cases.

Known semantics to keep in mind:

- `base_hour` can act as the hourly fallback when no later rule applies.
- `next_hour` supports ranges.
- Overnight pricing supports additive modes and daily-flat behavior.
- Passing tests are not proof by themselves; check that tests encode the desired
  business meaning.

## Device Management

Admin devices are managed through `/api/v1/devices` after auth and
`authorize('devices')`.

Device creation creates activation codes for frontend roles:

- Allowed activation device types: `kiosk`, `barrier_gate`.
- Activation code flow returns a code to enter on the device frontend.
- Device activation returns `deviceId` and a one-time `deviceToken`.

Runtime device records are synchronized with kiosk/barrier-gate config where
needed. Do not treat old separate kiosk/barrier config as the only source of
truth; inspect `devices.repo.js`, `kiosks.repo.js`, and `barrierGates.repo.js`
together before changing device behavior.

## Theme Rules

Theme config is stored under the `theme` app config key. Current backend behavior
does not enforce a strict enum for `themeMode`; source examples include
`theme1` and `custom`, and the default is an empty string. If the frontend needs
a fixed theme list, add validation intentionally and update OpenAPI/Postman.

## Documentation And API Contracts

When changing routes or response shapes:

- Update `src/docs/openapi.js`.
- Update the Postman collection if the changed endpoint is represented there.
- Mention concrete example request bodies when explaining API changes.
- Keep README and AGENTS.md derived from the real repo, not from generic
  templates.

## Testing And Verification

Use the existing test style:

- Keep tests focused and short.
- Define config, call the function or route-level behavior directly, and assert
  only the essential outputs.
- Add only small comments around setup and invocation boundaries when helpful.

Run verification after code changes:

```bash
npm test
```

For route/docs-only or documentation-only changes, inspect the edited files and
run tests when behavior changed or risk is non-trivial.

## Editing Guidance

- Prefer existing repository patterns over new abstractions.
- Keep edits scoped to the requested behavior.
- Do not revert unrelated working-tree changes.
- Use `app_config` helpers for config stored in `AppConfig`.
- Use repository/service helpers rather than duplicating persistence logic in
  route files.
- Keep route handlers focused on request parsing and response shaping.
- Keep comments succinct; add them only where they reduce future confusion.
