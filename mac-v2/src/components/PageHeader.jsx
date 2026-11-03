export const PageHeader = ({ eyebrow, title, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-6 pt-8 sm:px-10 sm:pt-10">
    <div className="rise">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">{eyebrow}</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
    </div>
    {children}
  </div>
);
