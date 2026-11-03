// Chat export — one conversation → Markdown (and back into a file download).
//
// v1's exporter lived inside ChatPanel and dropped attachments, dates and cost.
// This version keeps those so an exported chat is actually self-contained.

import { estimate } from "./cost";

export const chatFilename = (title) =>
  `${String(title || "chat").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "chat"}.md`;

const msgCost = (m) =>
  m.usage && m.content ? estimate(m.usage.model, m.usage.inChars || 0, m.content, m.usage.actual).cost : 0;

export const chatToMarkdown = (conv, agent = {}) => {
  const when = conv.updatedAt ? new Date(conv.updatedAt).toLocaleString() : "";
  const lines = [
    `# ${conv.title || "Untitled chat"}`,
    `_${agent.name || "Agent"}${agent.role ? ` · ${agent.role}` : ""}${agent.model ? ` · ${agent.model}` : ""}${when ? ` · ${when}` : ""}_`,
    "",
  ];
  let cost = 0;
  for (const m of conv.messages || []) {
    const who = m.role === "user" ? "You" : agent.name || "Agent";
    const tags = [...(m.gems || []).map((g) => `/${g.trigger}`)];
    lines.push(`**${who}**${tags.length ? ` ${tags.join(" ")}` : ""}`, "");
    for (const d of m.docs || []) {
      lines.push(d.kind === "image" ? `> 🖼 ${d.name} (image)` : `> 📎 ${d.name} (${d.kind || "doc"}${d.truncated ? ", truncated" : ""})`);
    }
    for (const n of m.notes || []) {
      lines.push(`> 📝 Anytype note "${n.name}"${n.truncated ? " (truncated)" : ""}`);
    }
    if ((m.docs?.length || m.notes?.length) && m.content) lines.push("");
    if (m.content) lines.push(m.content, "");
    if (m.role !== "user") cost += msgCost(m);
    if (m.error) lines.push(`> ⚠️ ${m.error}`, "");
  }
  if (cost > 0) lines.push(`---\n_Approximate model cost: ~$${cost.toFixed(4)}_`, "");
  return lines.join("\n");
};

export const downloadText = (filename, text, mime = "text/markdown") => {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
};

export const exportChat = (conv, agent) => {
  downloadText(chatFilename(conv.title), chatToMarkdown(conv, agent));
};
