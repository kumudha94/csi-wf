export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  return DATE_RE.test(value);
}

export function dateToString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayString(): string {
  return dateToString(new Date());
}

// Default date for a contribution collected today: if today is Sunday, use
// today; otherwise the most recent past Sunday. Matches how the fellowship
// actually dates a "this week's collection" entry.
export function lastSundayOrToday(date: Date = new Date()): string {
  const result = new Date(date);
  result.setDate(date.getDate() - date.getDay());
  return dateToString(result);
}

