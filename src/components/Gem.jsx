export const GemShape = ({ color, size = 14, className = "" }) => (
  <span className={`gem-glow inline-block shrink-0 ${className}`} style={{ "--gc": color }}>
    <span className="gem" style={{ width: size, height: size }} />
  </span>
);

export const GemChip = ({ gem, testid }) => (
  <span className="gem-chip" style={{ "--gc": gem.color }} data-testid={testid}>
    <GemShape color={gem.color} size={10} />/{gem.trigger}
  </span>
);
