import test from "node:test";
import assert from "node:assert/strict";
import { preserveServerManagedFields } from "../src/state-protection.js";

test("client cannot forge payment or publishing fields on an existing lead", () => {
  const existing = { id: "lead-1", paymentStatus: "pending", paymentId: null, websiteUrl: null };
  const incoming = { id: "lead-1", paymentStatus: "approved", paymentId: "fake", websiteUrl: "https://evil.example" };
  assert.deepEqual(preserveServerManagedFields(incoming, existing, ["paymentStatus", "paymentId", "websiteUrl"]), existing);
});

test("client cannot inject server-managed fields on a new record", () => {
  const incoming = { id: "lead-2", paymentStatus: "approved", paymentId: "fake", websiteUrl: "https://evil.example" };
  assert.deepEqual(preserveServerManagedFields(incoming, null, ["paymentStatus", "paymentId", "websiteUrl"]), { id: "lead-2" });
});
