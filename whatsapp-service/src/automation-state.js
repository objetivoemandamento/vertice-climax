export function normalizePersistedAutomationState(remote, limit = 1000) {
  const max = Math.max(1, Math.min(5000, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 1000));
  const enabled = typeof remote?.automationEnabled === "boolean" ? remote.automationEnabled : null;
  const seen = new Set();
  const contacts = [];
  for (const contact of Array.isArray(remote?.automationContacts) ? remote.automationContacts.slice(-max) : []) {
    if (!contact || typeof contact.chatId !== "string" || !contact.chatId.endsWith("@s.whatsapp.net")) continue;
    if (seen.has(contact.chatId)) continue;
    seen.add(contact.chatId);
    contacts.push({
      ...contact,
      name: typeof contact.name === "string" ? contact.name.slice(0, 120) : contact.chatId,
      consent: contact.consent === true,
      enabled: contact.enabled === true,
      stage: typeof contact.stage === "string" ? contact.stage.slice(0, 80) : "inicio",
      needsHuman: contact.needsHuman === true
    });
  }
  const processedIds = [...new Set((Array.isArray(remote?.processedAutoMessageIds) ? remote.processedAutoMessageIds : [])
    .filter(id => typeof id === "string" && id.length > 0 && id.length <= 200))].slice(-2000);
  return { enabled, contacts, processedIds };
}
