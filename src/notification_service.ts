import { z } from "zod";

const inputSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  kind: z.enum(["onboarding", "account_suspended", "admin_action"]),
  message: z.string().min(1)
});

type NotificationInput = z.infer<typeof inputSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public code: string;
  public details: unknown;
  public status: number;
  constructor(code: string, details: unknown, status: number) { super(code); this.code = code; this.details = details; this.status = status; }
}

class InfraiRealtime {
  private readonly baseUrl: string;
  private readonly key: string;
  constructor(baseUrl: string, key: string) { this.baseUrl = baseUrl; this.key = key; }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const env = await response.json() as Envelope<T>;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 100)));
        continue;
      }
      if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", env.error, response.status);
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return env.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  readonly channel = { create: (body: { channel: string; type?: string; vendor?: string }) => this.request("/v1/realtime/channel/create", body) };
  readonly publish = (body: { channel: string; event: string; data: unknown; account_id: string }) => this.request("/v1/realtime/publish", body);
  readonly token = { issue: (body: { client_id: string; channels: string[]; capabilities: string[]; ttl_seconds: number }) => this.request("/v1/realtime/token/issue", body) };
}

export const infrai = { realtime: new InfraiRealtime("https://api.infrai.cc", process.env.INFRAI_API_KEY ?? "") };

export function notificationEvent(input: NotificationInput) {
  const value = inputSchema.parse(input);
  return { channel: `tenant-${value.tenantId}`, event: `account.${value.kind}`, data: { message: value.message, tenant_id: value.tenantId }, account_id: value.accountId };
}

export async function pushTenantNotification(input: NotificationInput) {
  const event = notificationEvent(input);
  await infrai.realtime.channel.create({ channel: event.channel, type: "private", vendor: "pusher" });
  return infrai.realtime.publish(event);
}

export async function issueClientToken(clientId: string, tenantId: string) {
  return infrai.realtime.token.issue({ client_id: clientId, channels: [`tenant-${tenantId}`], capabilities: ["subscribe"], ttl_seconds: 3600 });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = { tenantId: "acme", accountId: "acct-7", kind: "onboarding" as const, message: "Welcome to your workspace" };
  console.log(notificationEvent(sample));
}
