// Agent handoff — send a message (or reply) to another agent as a new chat.
//
// Agents in v1 were isolated rooms; the handoff is the first cross-agent flow:
// quote the message, add an instruction, and open it as the first message of a
// fresh conversation with the target agent.

export const HANDOFF_QUOTE_CHARS = 2000;

export const QUICK_HANDOFFS = [
  { id: "critique", label: "Critique this", instruction: "Critique the quoted message: list weaknesses, then a concrete fix for each." },
  { id: "continue", label: "Continue this", instruction: "Continue from the quoted message — pick up exactly where it left off." },
  { id: "factcheck", label: "Fact-check this", instruction: "Fact-check the quoted message. Search the web where it helps and call out anything wrong or uncertain." },
  { id: "explain", label: "Explain this", instruction: "Explain the quoted message for someone smart but new to the topic: plain words, one analogy, then the key takeaway." },
];

const quote = (text) => {
  const t = String(text || "").trim();
  if (!t) return "";
  const cut = t.length > HANDOFF_QUOTE_CHARS;
  return (
    t
      .slice(0, HANDOFF_QUOTE_CHARS)
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n") + (cut ? "\n> …" : "")
  );
};

// message: a chat message; fromAgent: { name } — the agent it came from.
export const buildHandoff = ({ message, fromAgent, instruction }) => {
  const who = message?.role === "user" ? "The user" : fromAgent?.name || "Another agent";
  const attachments = [
    ...(message?.docs || []).map((d) => `document "${d.name}"`),
    ...(message?.notes || []).map((n) => `Anytype note "${n.name}"`),
  ];
  const parts = [
    quote(message?.content),
    attachments.length ? `(${who.toLowerCase()} also attached ${attachments.join(", ")} — ask for it if you need it.)` : "",
    `---\nFrom ${who.toLowerCase()} via ${fromAgent?.name || "another agent"}: ${instruction || "Take it from here."}`,
  ].filter(Boolean);
  return parts.join("\n\n");
};
