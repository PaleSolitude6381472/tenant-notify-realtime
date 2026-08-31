import assert from "node:assert/strict";
import { notificationEvent } from "./notification_service.js";

const result = notificationEvent({ tenantId: "northwind", accountId: "acct-42", kind: "admin_action", message: "Role updated" });
assert.deepEqual(result, { channel: "tenant-northwind", event: "account.admin_action", data: { message: "Role updated", tenant_id: "northwind" }, account_id: "acct-42" });
console.log("notification mapping test passed");
