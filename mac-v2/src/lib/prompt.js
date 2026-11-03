// Prompt assembly — which attachments actually ride along on a request.
//
// Attachments (documents, Anytype notes) are stored on the message that added
// them, but v1 injected *every* attachment's full text on *every* turn, so a
// long chat re-sent the same PDFs forever. This module keeps storage as-is and
// fixes the prompt side: attachments are included newest-first inside a shared
// character budget, and older ones collapse to a one-line placeholder so the
// model (and the token budget) isn't drowned by stale files.

export const ATTACH_BUDGET_CHARS = 24000;

const docBlock = (d) =>
  d.kind === "image"
    ? `[Attached image "${d.name}"${d.width ? ` (${d.width}×${d.height})` : ""} — the image itself is shown to the model alongside this message]`
    : `Attached document — "${d.name}" (${d.kind || "doc"}):\n${d.text}${d.truncated ? "\n(document truncated)" : ""}`;

const noteBlock = (n) =>
  `From my Anytype notes — "${n.name}":\n${n.markdown}${n.truncated ? "\n(note truncated)" : ""}`;

// Full text of one message, attachments included. Identical to v1's behaviour.
export const messageText = (m, { attachments = true } = {}) => {
  if (!attachments) return m.content || "";
  const parts = [];
  if (m.docs?.length) parts.push(m.docs.map(docBlock).join("\n\n"));
  if (m.notes?.length) parts.push(m.notes.map(noteBlock).join("\n\n"));
  if (!parts.length) return m.content || "";
  return `${parts.join("\n\n")}${m.content ? `\n\n${m.content}` : ""}`;
};

const attachChars = (m) =>
  (m.docs || []).reduce((s, d) => s + (d.text || "").length, 0) +
  (m.notes || []).reduce((s, n) => s + (n.markdown || "").length, 0);

const placeholder = (m) => {
  const names = [...(m.docs || []).map((d) => `document "${d.name}"`), ...(m.notes || []).map((n) => `note "${n.name}"`)];
  return `(earlier ${names.join(", ")} omitted to fit context — ask the user to re-attach if you need ${names.length > 1 ? "them" : "it"} again)`;
};

// messages: [{ id, role, content, docs?, notes? }] (already filtered/ordered).
// → { rows: [{ id, role, content }], included, omitted, attachChars }
export const buildPromptMessages = (messages, { attachmentBudget = ATTACH_BUDGET_CHARS } = {}) => {
  let left = Math.max(0, attachmentBudget);
  const rows = new Array(messages.length);
  let included = 0;
  let omitted = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const cost = attachChars(m);
    if (!cost) {
      rows[i] = { id: m.id, role: m.role, content: m.content || "" };
      continue;
    }
    if (cost <= left) {
      left -= cost;
      included += (m.docs?.length || 0) + (m.notes?.length || 0);
      rows[i] = { id: m.id, role: m.role, content: messageText(m) };
    } else {
      omitted += (m.docs?.length || 0) + (m.notes?.length || 0);
      rows[i] = { id: m.id, role: m.role, content: `${placeholder(m)}${m.content ? `\n\n${m.content}` : ""}` };
    }
  }
  return { rows, included, omitted, attachChars: attachmentBudget - left };
};

// Rough token estimate for the context meter (matches lib/context.js: ~4 chars/token).
export const approxTokens = (text) => Math.ceil(String(text || "").length / 4);

export const promptApproxTokens = (rows, persona = "", system = "") =>
  approxTokens(persona) + approxTokens(system) + rows.reduce((s, m) => s + approxTokens(m.content), 0);
