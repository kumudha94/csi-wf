/** Converts a JS number to the exact 2-decimal string Postgres numeric(10,2) expects. */
export function toMoney(amount: number): string {
  return amount.toFixed(2);
}

/** Converts a Postgres numeric-column value (returned as a string) back to a JS number. */
export function fromMoney(value: string | number): number {
  return typeof value === "number" ? value : parseFloat(value);
}
