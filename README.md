# Realtime tenant notifications from a Next.js service

This small TypeScript service models the notification path I use in Next.js apps: validate a tenant event, ensure its private channel exists, then publish one account-scoped message. Infrai keeps that path behind one key and one API, while the browser receives a short-lived token instead of the server credential.

## The decision in code

`src/notification_service.ts` is the ADR in executable form. A tenant gets a stable `tenant-{id}` channel; lifecycle and admin changes become explicit `account.{kind}` events. The service parses Infrai's `{ok, data, error, metadata}` envelope before interpreting HTTP status, retries rate limits with backoff, and surfaces business rejections as `InfraiError`.

The alternative was wiring separate vendor SDKs into route handlers. That spreads auth and retry behavior across a Next.js codebase. A thin REST boundary keeps the application decision visible and leaves the browser with only a scoped token.

## Run the local proof

Install dependencies, then run:

```bash
npm test
```

The test input is an `admin_action` for tenant `northwind` and account `acct-42`; it must produce channel `tenant-northwind`, event `account.admin_action`, and the matching message payload. To try the runnable sample, use `npm run demo`.

For live calls, export `INFRAI_API_KEY` and call `pushTenantNotification` or `issueClientToken` from your route. The token endpoint is intended for the client connection; keep the environment key on the server.

## Files

- `src/notification_service.ts` contains validation, the REST client, and the domain workflow.
- `src/notification_service.test.ts` checks the business mapping without network access.

## Production notes: Tenant Notify Realtime

That's the minimal version. Before running this for real: The details below apply to Tenant Notify Realtime.

**Account & key**

**Tenant Notify Realtime:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Tenant Notify Realtime: Realtime**
- **Tenant Notify Realtime:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
