# CSI-WF Cash Fund (Offering & Donation) — Design

## Purpose

The existing treasurer app (`docs/superpowers/specs/2026-08-29-treasurer-app-design.md`)
only models one income stream — member **Contributions** — feeding one
balance. In practice, the fellowship has three income streams flowing into
two separate, never-mixed pots of money:

1. **Offering (Kaanikkai)** — collected informally at every prayer meeting
   (~₹300–400/meeting). Spent immediately on meeting-day small costs (tea,
   coffee, biscuits, auto fare).
2. **Donation** — from anyone (member or not), typically ₹500–1000. Treated
   the same as offering — same pot, same spending pattern.
3. **Contribution** — members only, paid monthly, transferred to a joint
   bank account. Saved and drawn down only for big events (Christmas
   celebration, tours) — already fully modeled by the existing app.

This design adds Offering and Donation as a second fund ("Cash Fund"),
distinct from the existing bank-account fund ("Bank Fund"), so the app's
balance reflects how the money is actually held and spent.

## Data Model

**New tables:**

| Table | Fields | Notes |
|---|---|---|
| `cash_fund_income` | `id`, `type` (`offering`\|`donation`), `amount`, `date`, `donor_name` (nullable), `note` (nullable) | `donor_name` only meaningful for `donation` rows — donors aren't always registered members, so this is free text, not a `members` FK |
| `cash_fund_expenses` | `id`, `description`, `amount`, `date` | No `paid`/`pending` status — cash spending happens same-day, unlike Bank Fund vendor expenses |

**Modified table:**

| Table | Change |
|---|---|
| `settings` | Split single `opening_balance` into `bank_opening_balance` (rename of existing) and `cash_opening_balance` (new) |

**Unchanged tables:** `members`, `attribute_definitions`,
`member_attribute_values`, `events`, `expenses`, `contributions` — these
already correctly model the Contribution → big-event flow and are
unaffected by this change.

## Balance Formulas

Two independent balances, computed the same way as today (never cached):

```
Bank Fund balance = bank_opening_balance + Σ(contributions.amount) − Σ(expenses.amount WHERE status = 'paid')
Cash Fund balance  = cash_opening_balance + Σ(cash_fund_income.amount) − Σ(cash_fund_expenses.amount)
```

These funds are never combined into a single number anywhere in the app —
every screen that shows "balance" shows both, labeled.

## Screens

1. **Balance screen** — adds a fund switcher (or two clearly labeled
   sections) alongside the existing Contributions/General Expenses UI:
   - **Bank Fund** (unchanged): current Contributions + General Expenses
     sub-sections, existing balance formula.
   - **Cash Fund** (new): current balance at top; forms to log an Offering
     entry (amount, date, note), a Donation entry (amount, date, donor
     name, note), and a meeting expense (description, amount, date — same
     free-text pattern as existing expense form, no category picker).
     - **Donor name autocomplete:** while typing `donor_name` on the
       Donation form, match against `members.name` (client-side filter of
       the already-loaded members list, same as Members screen search) and
       show matches in a dropdown below the field. Selecting one fills the
       field with that member's name. Typing without selecting a suggestion
       is valid — `donor_name` stays plain free text, no FK to `members`,
       so non-member donors are unaffected.
     - **List entries** (Offering, Donation, and meeting expense rows, plus
       existing Contribution rows) follow the Members screen convention:
       tap a row to open it pre-filled in the same form for editing;
       trailing trash icon opens a destructive confirm-delete `Alert`.
2. **Reports** — date-range totals extend to break down by fund: Cash Fund
   (offering total, donation total, expenses, closing balance) alongside
   the existing Bank Fund breakdown (contributions, event/general
   expenses, closing balance). Same PDF export pattern as today, now
   covering both funds in one document.
3. **Settings** — gains a second opening-balance field (`cash_opening_balance`),
   set once during onboarding alongside the existing bank opening balance.

## Error Handling

Mirrors the existing app's approach — no new patterns introduced:

- Standard validation (required fields, `amount > 0`) surfaced as inline
  form errors.
- Network errors: existing simple retry banner, no offline queue.

## Testing

- Backend: unit tests for both balance formulas (Cash Fund has no
  paid/pending filtering, unlike Bank Fund — worth a dedicated test to
  catch that difference), and CRUD validation for the two new tables.
- Mobile: manual verification of golden paths (log offering → Cash Fund
  balance updates, log donation with donor-name autocomplete — both
  selecting a suggested member and typing a non-member name, log meeting
  expense, edit and delete each entry type, view both funds on Reports).

## Out of Scope (explicitly deferred)

- Cross-fund transfers (e.g., moving Cash Fund surplus into the bank
  account) — not part of how the fellowship currently operates.
- Per-attendee offering tracking — offering is collected and logged as one
  lump sum per meeting, not itemized by person.
- Donor receipts/acknowledgment workflow — `donor_name` is a plain note
  field, no receipt generation.
- Category picker for Cash Fund expenses — free-text description matches
  how this spending is actually noted today.
