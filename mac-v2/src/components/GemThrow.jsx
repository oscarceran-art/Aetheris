import { motion } from "framer-motion";
import { GemShape } from "./Gem";

const G = 24;

const arc = ({ from, to }, i) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 110 + i * 35;
  return { x: (from.x + to.x) / 2 + (-dy / len) * bend, y: (from.y + to.y) / 2 + (dx / len) * bend };
};

export const GemThrows = ({ throws, onImpact }) => (
  <div className="pointer-events-none fixed inset-0 z-50" data-testid="gem-throw-layer">
    {throws.map((t, i) => {
      const mid = arc(t, i);
      const p = (v) => v - G / 2;
      return (
        <motion.div
          key={t.key}
          className="absolute left-0 top-0"
          data-testid={`gem-throw-${t.gem.trigger}`}
          initial={{ x: p(t.from.x), y: p(t.from.y), scale: 0.4, opacity: 0, rotate: 0 }}
          animate={{
            x: [p(t.from.x), p(mid.x), p(t.to.x), p(t.to.x)],
            y: [p(t.from.y), p(mid.y), p(t.to.y), p(t.to.y)],
            scale: [0.5, 1.45, 0.75, 0],
            rotate: [0, 240, 420, 600],
            opacity: [0, 1, 1, 0],
          }}
          transition={{ duration: 1.05, delay: t.delay, ease: [0.45, 0, 0.3, 1], times: [0, 0.42, 0.8, 1] }}
          onAnimationComplete={() => onImpact(t)}
        >
          <GemShape color={t.gem.color} size={G} className="gem-flying" />
          {[1, 2, 3].map((k) => <span key={k} className="gem-trail" style={{ "--gc": t.gem.color, "--k": k }} />)}
        </motion.div>
      );
    })}
  </div>
);
