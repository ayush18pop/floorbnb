/** The floor and the cushion, at deposit, for a 90% floor and m = 4 (CONTEXT.md). Schematic, not data. */
export function StackDiagram() {
  const seg = "flex items-center justify-center px-2 text-center mono text-[12px] leading-tight h-16";
  return (
    <div className="w-full" role="img" aria-label="At deposit, value is 100. The floor is 90, the cushion is 10. The vault holds 4 times the cushion in stock, 40, and the other 60 in USDT.">
      <p className="label mb-2">Value V = 100% of deposit</p>
      <div className="flex w-full border border-grid-strong" aria-hidden="true">
        <div className={`${seg} border-r border-grid-strong`} style={{ width: "90%", background: "var(--surface-sunken)", color: "var(--text-2)" }}>FLOOR F = 90</div>
        <div className={seg} style={{ width: "10%", background: "var(--accent-soft)", color: "var(--accent)", minWidth: 64 }}>CUSHION 10</div>
      </div>
      <p className="label mb-2 mt-6">Where the money sits at the start (stock = 4 × cushion)</p>
      <div className="flex w-full border border-grid-strong" aria-hidden="true">
        <div className={`${seg} border-r border-grid-strong`} style={{ width: "40%", background: "var(--text)", color: "var(--bg)" }}>STOCK 40</div>
        <div className={seg} style={{ width: "60%", background: "var(--surface)", color: "var(--text-2)" }}>USDT 60</div>
      </div>
      <p className="label mt-3" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
        Schematic for a 90% floor. Not backtest data.
      </p>
    </div>
  );
}
