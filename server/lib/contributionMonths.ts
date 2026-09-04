function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Every calendar month from the later of (this year's Jan 1, the member's
 * join month) up to and including `now`'s month, that has no entry in
 * `paidMonths` -- in chronological order, current month last. Bounds gap
 * calculation to the current calendar year even for members who joined
 * earlier, matching how the Contributions tab frames "this year's dues."
 */
export function getMissingMonths(memberCreatedAt: Date, now: Date, paidMonths: Set<string>): string[] {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const joinMonth = monthStart(memberCreatedAt);
  const earliest = joinMonth > yearStart ? joinMonth : yearStart;
  const current = monthStart(now);

  const months: string[] = [];
  let cursor = earliest;
  while (cursor <= current) {
    const monthStr = monthString(cursor);
    if (!paidMonths.has(monthStr)) months.push(monthStr);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

/**
 * Splits a lump-sum payment evenly (2-decimal rupees) across the months it
 * covers. Any leftover paisa from a non-divisible amount (e.g. Rs.250
 * across 3 months) is added to the last month in `months` -- the most
 * recent one, per the gap-fill rule in the design spec.
 */
export function splitAmountAcrossMonths(
  totalAmount: number,
  months: string[]
): { forMonth: string; amount: number }[] {
  const base = Math.floor((totalAmount / months.length) * 100) / 100;
  const distributed = Math.round(base * (months.length - 1) * 100) / 100;
  const lastAmount = Math.round((totalAmount - distributed) * 100) / 100;

  return months.map((forMonth, i) => ({
    forMonth,
    amount: i === months.length - 1 ? lastAmount : base,
  }));
}
