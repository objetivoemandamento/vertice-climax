import test from "node:test";
import assert from "node:assert/strict";
import { normalizePersistedAutomationState } from "../src/automation-state.js";

test("restores automation setting and valid individual contacts", () => {
  const result = normalizePersistedAutomationState({
    automationEnabled: true,
    automationContacts: [
      { chatId: "5511999999999@s.whatsapp.net", consent: true, enabled: true, stage: "Descoberta" },
      { chatId: "120363000@g.us", consent: true, enabled: true },
      { chatId: "5511888888888@s.whatsapp.net", consent: false, enabled: false, stage: "Sem interesse" }
    ],
    processedAutoMessageIds: ["m1", "m2", "m1", null]
  }, 100);
  assert.equal(result.enabled, true);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.contacts[0].consent, true);
  assert.equal(result.contacts[1].consent, false);
  assert.deepEqual(result.processedIds, ["m1", "m2"]);
});

test("keeps an explicit disabled state and bounds stored contacts", () => {
  const result = normalizePersistedAutomationState({
    automationEnabled: false,
    automationContacts: Array.from({ length: 4 }, (_, i) => ({
      chatId: `55119999999${i}@s.whatsapp.net`, consent: true, enabled: true
    }))
  }, 2);
  assert.equal(result.enabled, false);
  assert.equal(result.contacts.length, 2);
  assert.equal(normalizePersistedAutomationState({}).enabled, null);
});
