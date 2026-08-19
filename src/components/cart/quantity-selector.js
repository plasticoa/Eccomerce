"use client";

export function QuantitySelector({ value, max, onChange, disabled = false, label = "Cantidad" }) {
  const commit = (next) => {
    const parsed = Math.max(1, Math.min(max, Number.parseInt(next, 10) || 1));
    if (parsed !== value) onChange(parsed);
  };
  return (
    <div className="quantity-selector" aria-label={label}>
      <button type="button" onClick={() => commit(value - 1)} disabled={disabled || value <= 1} aria-label="Disminuir cantidad">−</button>
      <input type="number" min="1" max={max} value={value} disabled={disabled} onChange={(event) => commit(event.target.value)} aria-label={label} />
      <button type="button" onClick={() => commit(value + 1)} disabled={disabled || value >= max} aria-label="Aumentar cantidad">+</button>
    </div>
  );
}
