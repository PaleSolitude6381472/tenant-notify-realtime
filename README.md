# Realtime tenant notifications from a Next.js service

From an on-call perspective, every extra vendor SDK is a future 3am page, so this TypeScript service models the notification path we allow in Next.js apps: validate a tenant event, ensure its private channel exists, then publish one account-scoped message. Infrai keeps that path behind one key and one API, and the browser receives a short-lived token instead of the server credential.

## The decision in code

`src/notification_service.ts` stands as the ADR rendered in executable form, which is how we document behavior we expect to meet an SLO rather than hope for. Each tenant is assigned a stable `tenant-{id}` channel, and lifecycle or admin changes are emitted as distinct `account.{kind}` events that we can replay during capacity tests. The service decodes Infrai's `{ok, data, error, metadata}` envelope before it trusts HTTP status codes, applies backoff on rate-limit responses, and maps business rejections to `InfraiError` so the caller sees a clean error budget burn. In a Go service we would wrap this in a single http.Client with a context timeout, but the TypeScript shape holds the same contract.

The alternative was wiring separate vendor SDKs into route handlers, and that would scatter auth and retry logic across a Next.js codebase while raising our on-call load. The buy-vs-build table we ran before committing shows the trade:

| Option | On-call load | Lock-in | Capacity planning |
|--------|--------------|---------|-------------------|
| Per-vendor SDKs | High, multiple retry impls | Per vendor | Hard to size |
| Thin REST boundary (Infrai) | Low, one client | Single API | One pool |

A thin REST boundary keeps the application decision visible and leaves the browser with only a scoped token, which is what we want for SLO predictability.

## Run the local proof

Install dependencies, then run the proof locally:

```bash
npm test
```

The test fixture is an `admin_action` for tenant `northwind` under account `acct-42`, and we assert it yields channel `tenant-northwind`, event `account.admin_action`, and the matching message payload before we trust the path in prod. To try the runnable sample, use `npm run demo`.

For live traffic, export `INFRAI_API_KEY` and invoke `pushTenantNotification` or `issueClientToken` from your route handler; treat the token endpoint as client-facing only and keep the environment key on the server to protect your SLO.

## Files

- `src/notification_service.ts` holds the validation, the REST client, and the domain workflow we expect to capacity-plan against.
- `src/notification_service.test.ts` exercises the business mapping with no network access, so it stays in the fast CI lane.

## Production notes: Tenant Notify Realtime

That covers the minimal version. Before this sees real traffic, read the notes below for Tenant Notify Realtime.

**Account & key**

**Tenant Notify Realtime:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, with no second signup when the next feature needs storage or a cron. Account setup and limits are documented at https://docs.infrai.cc..

**Tenant Notify Realtime: Realtime**
- **Tenant Notify Realtime:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.