export const DEFAULT_MODELS = ["gpt-6-luna", "gpt-6-sol"];

export const COLORS = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#f87171", "#cbd5e1"];

export const GEM_COLORS = [
  "#f43f5e", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#e2e8f0", "#fbbf24",
];

export const DEFAULT_AGENTS = [
  {
    id: "agent-researcher", name: "Nova", role: "Researcher", color: "#22d3ee", model: "gpt-6-luna", temperature: 0.5,
    persona: "You are Nova, a meticulous researcher. You gather facts, state assumptions explicitly, and surface relevant context, trade-offs and unknowns. Be structured and concise.",
  },
  {
    id: "agent-architect", name: "Atlas", role: "Architect & Coder", color: "#a78bfa", model: "gpt-6-luna", temperature: 0.3,
    persona: "You are Atlas, a pragmatic systems architect and senior engineer. You turn ideas into concrete designs, plans and clean code. Prefer simple, robust solutions.",
  },
  {
    id: "agent-critic", name: "Vex", role: "Critic", color: "#f59e0b", model: "gpt-6-luna", temperature: 0.6,
    persona: "You are Vex, a sharp but constructive critic. You find flaws, risks, edge cases and weak reasoning, and always propose a fix for each issue you raise.",
  },
  {
    id: "agent-creative", name: "Lumen", role: "Creative Director", color: "#f472b6", model: "gpt-6-luna", temperature: 0.9,
    persona: "You are Lumen, an imaginative creative director. You reframe problems, propose bold unconventional angles, and care about story, taste and delight.",
  },
  {
    id: "agent-synth", name: "Prism", role: "Synthesizer", color: "#34d399", model: "gpt-6-luna", temperature: 0.4,
    persona: "You are Prism, a synthesizer. You merge multiple perspectives into one clear, well-structured, actionable answer, resolving disagreements explicitly.",
  },
];

export const DEFAULT_GEMS = [
  { id: "gem-idea", fav: true, trigger: "idea", color: "#f59e0b", agentId: null, instruction: "Reply with 3 bold ideas, one line each, then one wild-card idea." },
  { id: "gem-short", fav: true, trigger: "short", color: "#06b6d4", agentId: null, instruction: "Answer in at most 3 short sentences." },
  { id: "gem-explain", trigger: "explain", color: "#8b5cf6", agentId: null, instruction: "Explain it for someone smart but new to the topic: plain words, one analogy, then the key takeaway." },
  { id: "gem-code", trigger: "code", color: "#22c55e", agentId: null, instruction: "Respond mainly with clean, working code in fenced blocks and minimal prose." },
  { id: "gem-critique", trigger: "critique", color: "#f43f5e", agentId: null, instruction: "Critique it: list the weaknesses, then a concrete fix for each." },
];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_TEMPLATES = {
  "agent-researcher": ["Give me a briefing on…", "What are the open questions about…"],
  "agent-architect": ["Design a simple architecture for…", "Write clean code that…"],
  "agent-critic": ["Find the holes in this plan:", "What could go wrong with…"],
  "agent-creative": ["Pitch 5 unexpected angles for…", "Name this:"],
  "agent-synth": ["Summarise and decide between:", "Turn these notes into a plan:"],
};
