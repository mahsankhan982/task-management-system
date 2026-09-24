// Reuse formatters; no timeZone override means the viewer's local timezone.
const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
export function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown date" : date.format(parsed) + " \u2022 " + time.format(parsed);
}
