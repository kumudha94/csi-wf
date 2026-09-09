const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function getMonthLabel(date: Date): string {
  return MONTH_NAMES[date.getMonth()];
}

export function todayDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export type DateRange = { from: string; to: string };

export function getMonthRange(date: Date): DateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(lastDay)}` };
}

// Weeks are counted from the 1st of the month in fixed 7-day blocks (1-7,
// 8-14, ...), not ISO calendar weeks — matches "week N of this month"
// rather than a week-of-year number.
export function getWeekOfMonthRange(date: Date): { weekNumber: number } & DateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const weekNumber = Math.ceil(day / 7);
  const weekStartDay = (weekNumber - 1) * 7 + 1;
  const weekEndDay = Math.min(weekStartDay + 6, lastDay);

  return {
    weekNumber,
    from: `${year}-${pad(month + 1)}-${pad(weekStartDay)}`,
    to: `${year}-${pad(month + 1)}-${pad(weekEndDay)}`,
  };
}

// The window a deposit must land in to count as "this month's contributions
// were deposited" -- the month itself, or the following month (treasurers
// commonly deposit a month's collected cash early the next month rather
// than same-day).
export function getDepositWindow(date: Date): DateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = `${year}-${pad(month + 1)}-01`;

  const nextMonthDate = new Date(year, month + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();
  const nextMonthLastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const to = `${nextYear}-${pad(nextMonth + 1)}-${pad(nextMonthLastDay)}`;

  return { from, to };
}
