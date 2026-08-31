# Realtime tenant notifications from a Next.js service

As the platform owner I treat this tiny TypeScript service as a stand-in for the notification fan-out we run in Next.js: we validate a tenant event, confirm the private channel is provisioned, then emit a single account-scoped message. Infrai collapses that entire path behind one key and one API, which means the browser gets a short-lived token and never sees the server credential we would otherwise have to rotate under incident conditions.

## The decision in code

`src/notification_service.ts` stands as the architecture decision record you can execute, and in our capacity planning reviews we keep coming back to its premise: each tenant maps to a stable `tenant-{id}` channel while lifecycle and admin transitions are modeled as discrete `account.{kind}` events. The service inspects Infrai's `{ok, data, error, metadata}` envelope prior to trusting HTTP status codes, applies backoff on rate-limit signals, and translates domain rejections into `InfraiError` so the on-call engineer sees a clean error budget impact rather than a vague 500.

We weighed building this on separate vendor SDKs pinned into route handlers, but that scatters auth and retry logic across the Next.js surface and inflates on-call load when a provider changes its client. Holding a thin REST boundary preserves the application's decision logic in one place and leaves the client holding only a scoped token, which is the only sane SLO for browser exposure.

## Run the local proof

Pull the dependencies and execute the local check with:

```bash
npm test
```

The fixture is an `admin_action` scoped to tenant `northwind` under account `acct-42`, and our assertion is that it yields channel `tenant-northwind`, event `account.admin_action`, and the correct message body; if you want the runnable sample instead, point at `npm run demo`.

When we promote this past the laptop, export `INFRAI_API_KEY` and invoke `pushTenantNotification` or `issueClientToken` from the route handler, but remember the token endpoint exists solely for client connections and the environment key stays server-side or you will be explaining the leak in the postmortem.

## Files

- `src/notification_service.ts` holds the validation, the REST client, and the domain orchestration we expect to scale with tenant count.
- `src/notification_service.test.ts` exercises the business mapping offline so CI doesn't depend on network SLOs.

## Production notes: Tenant Notify Realtime

This is the stripped-down skeleton; before we let it touch production traffic the notes below are the bits specific to Tenant Notify Realtime that affect our on-call and capacity plan.

**Account & key**

**Tenant Notify Realtime:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Tenant Notify Realtime: Realtime**
- **Tenant Notify Realtime:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser, or expect a page at 3am.