import { useEffect, useState } from "react";
import { COLORS } from "../lib/defaults";

const hash = (s = "") => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Custom planet colours pick their own second tone: rotate the hue so the orb
// still gets a rich two-tone look instead of falling back to a preset colour.
export const hueShift = (hex, deg) => {
  let n = String(hex || "").replace("#", "").trim();
  if (n.length === 3) n = [...n].map((c) => c + c).join("");
  if (n.length !== 6 || /[^0-9a-f]/i.test(n)) return "#a78bfa";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hdeg = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hdeg = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  }
  hdeg = (hdeg + deg + 360) % 360;
  s = Math.min(1, Math.max(s, 0.5));
  const ll = Math.min(0.7, Math.max(l, 0.42));
  const c = (1 - Math.abs(2 * ll - 1)) * s;
  const x = c * (1 - Math.abs(((hdeg / 60) % 2) - 1));
  const m = ll - c / 2;
  const seg = Math.floor(hdeg / 60) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return "#" + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
};

// Cycle through gem colours, one per pulse
export const useCycle = (colors, ms = 1600) => {
  const [i, setI] = useState(0);
  const sig = colors?.join() || "";
  useEffect(() => {
    setI(0);
    if (!colors || colors.length < 2) return;
    const t = setInterval(() => setI((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return colors?.length ? colors[i % colors.length] : null;
};

const Ring = ({ side, twoMoons }) => (
  <div className={`orb-ring ${side}`}>
    <div className="orb-ring-track">
      <span className="orb-moon" />
      {twoMoons && <span className="orb-moon b" />}
      {side === "front" && <span className="orb-comet" />}
    </div>
  </div>
);

export const AgentAvatar = ({ agent, size = 36, pulse = false, gemPulse = null, impact = null }) => {
  const h = hash(agent?.id);
  const c1 = agent?.color || COLORS[0];
  const preset = COLORS.indexOf(c1);
  const c2 = preset >= 0 ? COLORS[(preset + 1 + (h % 3)) % COLORS.length] : hueShift(c1, 38 + (h % 3) * 26);
  const gp = useCycle(gemPulse);
  const ring = size >= 28;
  return (
    <div
      className={`orb-av ${pulse ? "orb-live" : ""} ${gp ? "orb-gpulse" : ""}`}
      data-testid={`agent-orb-${agent?.id}`}
      style={{
        width: size,
        height: size,
        "--s": `${size}px`,
        "--c1": c1,
        "--c2": c2,
        "--gp": gp || c1,
        "--spin": `${7 + (h % 6)}s`,
        "--delay": `-${h % 9}s`,
        "--tilt": `${(h % 50) - 25}deg`,
        "--band": `${(h % 40) - 20}deg`,
      }}
    >
      <div className="orb-halo" />
      {ring && <Ring side="back" twoMoons={h % 2 === 0} />}
      <div className="orb-shell" />
      <div className="orb-sphere">
        <div className="orb-plasma p1" />
        <div className="orb-plasma p2" />
        <div className="orb-plasma p3" />
        <div className="orb-swirl" />
        <div className="orb-bands" />
        <div className="orb-gp" />
        <div className="orb-terminator" />
        <div className="orb-gloss" />
        {impact && (
          <div key={impact.key} style={{ "--ic": impact.color }} data-testid="orb-flash">
            <div className="orb-flash" />
            <div className="orb-ripple" />
          </div>
        )}
      </div>
      <div className="orb-aurora" />
      {ring && <Ring side="front" twoMoons={h % 2 === 0} />}
      {impact && <div key={`s-${impact.key}`} className="orb-impact" style={{ "--ic": impact.color }} />}
    </div>
  );
};
