export function ProductAvailability({ availability, compact = false }) {
  return (
    <span className={`availability availability-${availability.key}${compact ? " availability-compact" : ""}`}>
      <span aria-hidden="true" />
      {availability.label}
    </span>
  );
}
