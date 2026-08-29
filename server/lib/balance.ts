export type BalanceInputs = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
};

/**
 * balance = opening balance + contributions - paid expenses.
 * Pending expenses never affect this — they're surfaced separately as
 * "upcoming/owed" so the treasurer sees committed-but-unpaid costs without
 * them touching the actual cash balance.
 */
export function computeBalance({ openingBalance, totalContributions, totalPaidExpenses }: BalanceInputs): number {
  const raw = openingBalance + totalContributions - totalPaidExpenses;
  return Math.round(raw * 100) / 100;
}
