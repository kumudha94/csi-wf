# CSI-WF Bank Screen Redesign — Design

## Purpose

The current Balance screen's Bank Fund side (Contributions + General Expenses
tabs, per `2026-08-29-treasurer-app-design.md`) doesn't reflect how the
fellowship actually handles bank money: contributions are collected and
deposited to the bank monthly; when a big event (Christmas celebration,
annual trip) needs funds, money is withdrawn from the bank and held "in
hand" until spent, with any leftover redeposited. The app currently tracks
one Bank Fund number with paid/pending vendor expenses, which doesn't
capture the deposit/withdrawal/in-hand cycle or make it easy to see whether
a given month's contributions have actually been deposited yet.

This redesigns the Bank side of the app around that real cash-flow cycle,
and separately simplifies contribution entry for ~350 members (currently a
one-at-a-time typeahead form) into a fast collect-list flow that handles
members who pay in irregular gaps.

**Scope note:** the equivalent Cash Fund (Offering/Donation/meeting
expenses) redesign, promoting it to its own top-level "CashFlow" tab, moving
Members and Reports into Settings, and the final bottom-nav reorder
(Dashboard → Events → Bank → CashFlow → Settings) are all explicitly
deferred to a later phase, once CashFlow is designed. This phase only
renames the existing "Balance" tab to "Bank" and redesigns its Bank Fund
side; the Bank Fund/Cash Fund switcher inside that screen, and the Cash
Fund side behind it, are untouched.

## Data Model

**New table** `bank_transactions`:

| Field | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `type` | enum: `deposit` \| `withdrawal` \| `cash_expense` | `deposit` = money moved into the bank account (e.g. depositing collected contributions, or redepositing leftover in-hand cash). `withdrawal` = money taken out of the bank into hand, for an upcoming event. `cash_expense` = money spent from the in-hand cash. |
| `description` | text, required | Reason/what this was for. |
| `amount` | numeric(10,2), required, > 0 | |
| `date` | date, required | |
| `receiptPhotoUrl` | text, nullable | Reuses the existing `uploadReceipt` upload flow from `lib/api.ts` (already used by `ExpenseForm`). |
| `createdAt` | timestamp | |

This table replaces the `expenses` rows where `eventId IS NULL` ("General
Expenses") for Bank Fund purposes. **Event-scoped expenses** (`eventId`
set, e.g. Christmas celebration vendor costs) are untouched — they keep
their own `expenses` table row shape and pending/paid status exactly as
today; `EventDetailScreen.tsx`'s paid/pending badges and totals are
unaffected by this change.

**`contributions` table** gains one column:

| Field | Type | Notes |
|---|---|---|
| `forMonth` | date, required | Stored as the 1st of the covered month (e.g. `2026-09-01`). Distinct from `date` (when the payment physically happened). A single payment event that clears a multi-month gap produces one `contributions` row per covered month, same `date`, different `forMonth`, amount split as entered. |

No new `settings` fields are needed — `bankOpeningBalance` already exists
(from the cash-fund work). "Balance in Hand" has no opening value; by
definition nothing is in hand until a withdrawal happens.

**No data migration required** — confirmed with the project owner that
existing `expenses` (general) and `contributions` rows are test data, safe
to reset/discard as part of this schema change.

## Balance Formulas

**Critical clarification from the project owner:** events are never paid
for directly from the bank. Money is withdrawn from the bank as one lump
sum, held in hand, and *all* event spending (Christmas celebration, annual
trip, etc.) comes out of that withdrawn cash — never a direct bank
payment. This means paid event expenses must stop reducing **Bank
Balance** (which the pre-existing formula in `server/lib/balance.ts` /
`server/storage/balance.ts` does today — `totalPaidExpenses` there sums
*all* `expenses` rows with `status='paid'`, event-scoped ones included) and
instead reduce **Balance in Hand**:

```
Bank Balance    = bankOpeningBalance + Σ(bank_transactions.amount WHERE type = 'deposit')
                                       − Σ(bank_transactions.amount WHERE type = 'withdrawal')

Balance in Hand = Σ(bank_transactions.amount WHERE type = 'withdrawal')
                  − Σ(bank_transactions.amount WHERE type = 'cash_expense')
                  − Σ(expenses.amount WHERE event_id IS NOT NULL AND status = 'paid')
```

This is a breaking change to the existing Bank Fund balance formula: the
`event_id IS NULL` ("general") expenses term disappears entirely (replaced
by `bank_transactions`, per the Data Model section), and the `event_id IS
NOT NULL` term moves from reducing Bank Balance to reducing Balance in
Hand. `EventDetailScreen.tsx`'s own pending/paid UI and per-event totals
are unaffected — only where the *paid* total feeds into system-wide balance
changes.

**Deposit status** ("[Month] deposit completed / pending"): a `deposit`-type
`bank_transactions` row exists dated within that month or the following
month. Simple existence check — no amount reconciliation against that
month's collected contributions.

## Screens & Components

### Tab rename

`App.tsx`: the `Balance` tab is renamed to `Bank` (label + icon). It stays
in its current position in the bottom tab bar for this phase — no reorder
yet.

### `BalanceScreen.tsx`

The outer Bank Fund / Cash Fund switcher is unchanged. The `BankFundView`
sub-component is replaced by the new design:

- **Gradient summary card**: Bank Balance, Balance in Hand, and the
  deposit-status line ("Aug month deposit completed" / pending), computed
  from the formulas above.
- **Tab switcher**: `Transfers` (default selected) / `Contributions`.
- **Transfers tab**: list of `bank_transactions` (all types together),
  newest first. Tap a row to edit; trailing trash icon opens a destructive
  confirm-delete `Alert` (same pattern as existing expense/contribution
  lists). "+ Add Transfer" button opens `BankTransactionForm`.
- **Contributions tab**: summary line ("Collected ₹X from N members this
  [Month]" / "Pending ₹Y from M members"), then a searchable list of
  members (search by name or santha number, same filter pattern as
  `MembersScreen`). Each row: name, santha number, amount input pre-filled
  with the **total currently owed** (`member.defaultAmount` × count of
  missing months — just `defaultAmount` itself when only the current month
  is owed; a helper line under the row states the gap, e.g. "Santha amount
  pending for 3 months"), and an Add/Paid button. Tapping Add records a
  payment for the current month and any gap months (see gap-fill logic
  below). Tapping a row that's already paid for the current month opens it
  for edit (amount and date only — member and month aren't editable).

### `BankTransactionForm.tsx` (new component)

Not a shared edit of `ExpenseForm.tsx` — event expenses keep their own
paid/pending-driven form untouched. New component, structurally similar to
`ExpenseForm`:

- **Transfer type** (required, dropdown): "Transfer to account" (→
  `deposit`), "Transfer from account" (→ `withdrawal`), "Debit from cash
  which is transferred from account" (→ `cash_expense`).
- **Reason / Description** (required, free text).
- **Amount** (required, > 0).
- **Date** (required, calendar-icon date picker — same
  `DateTimePicker` pattern as `ContributionForm.tsx`).
- **Receipt / voucher photo** (optional) — reuses `uploadReceipt` /
  `receiptPhotoUrl`, same UI as `ExpenseForm`'s photo picker.
- No status field.

### `ContributionCollectForm.tsx` (new component, replaces `ContributionForm.tsx` for this flow)

- Fetches members + this month's existing `contributions` (`forMonth` =
  current month) to know who's already paid.
- For each member, computes how many consecutive past months (back to
  their join date or start of year, whichever is later) have no
  `contributions` row — the "gap."
- Summary card totals: collected this month (Σ amount where `forMonth` =
  current month) / members paid; pending estimate (Σ each unpaid member's
  `defaultAmount` × their gap length) / members with a gap.
- Search filters the list client-side (name or santha number), same
  pattern as `MembersScreen`.
- **Add action**: if the member has no gap (only current month owed),
  inserts one `contributions` row (`forMonth` = current month, `date` =
  computed default date, `amount` = whatever's in the row's amount field).
  If the member has a gap, the amount entered is divided evenly across all
  covered months (gap months + current), one row per month, same `date`;
  any remainder from non-divisible amounts (e.g. ₹250 across 3 months) is
  added to the most recent (current) month's row. The treasurer can correct
  any individual month's amount afterward via the edit flow.
- **Edit action** (tapping an already-paid current-month row): opens amount
  and date only; member and `forMonth` are fixed.
- **Default date logic** (shared helper, also usable elsewhere later): if
  today is Sunday, use today; otherwise use the most recent past Sunday.

### Dashboard update

`DashboardScreen.tsx`'s "Account details" card currently reads
`data.bank.balance` / `data.bank.pending` (the old paid/pending-expense
concept). This changes to `data.bank.balance` / `data.bank.inHand`, plus
the deposit-status line. `DashboardSummary.bank` type changes from
`{ balance: number; pending: number }` to
`{ balance: number; inHand: number; depositStatus: { month: string; completed: boolean } }`.
The `/api/dashboard` backend handler is updated to match.

## Error Handling

Mirrors the existing app's approach — no new patterns:

- Standard validation (required fields, `amount > 0`) as inline form
  errors, same as `ExpenseForm`/`ContributionForm` today.
- Network errors: existing simple retry banner, no offline queue.
- Receipt photo upload failure: existing `Alert.alert` pattern from
  `ExpenseForm`.

## Testing

- **Backend**: unit tests for
  - Bank Balance / Balance in Hand formulas across all three transaction
    types, plus Balance in Hand correctly subtracting paid event expenses
    (and ignoring pending ones, and ignoring any stray `event_id IS NULL`
    rows).
  - Deposit-completed existence check (present in-month, present following
    month, absent).
  - Multi-month gap-fill insert logic, including uneven splits (e.g.
    default ₹100/month, 3-month gap, ₹250 paid — not evenly divisible).
  - CRUD validation for `bank_transactions` and the new `forMonth` column
    on `contributions`.
- **Mobile**: manual verification of golden paths — add a deposit, a
  withdrawal, a cash expense, confirm both balances update correctly and
  the Transfers list shows all three; add a contribution for a fresh month;
  clear a 3-month gap in one action and confirm three `forMonth`-tagged
  rows land with correct dates and amounts; edit and delete each entry
  type; confirm Dashboard's Bank card reflects the new balances and
  deposit status; confirm `EventDetailScreen` expenses (pending/paid) are
  unaffected.

## Out of Scope (explicitly deferred)

- CashFlow screen redesign (Cash Fund side stays exactly as-is, reachable
  via the existing Bank Fund/Cash Fund switcher inside the renamed Bank
  tab).
- Promoting CashFlow to its own top-level tab.
- Moving Members and Reports screens into Settings.
- Final bottom-nav reorder (Dashboard → Events → Bank → CashFlow →
  Settings).
- Data migration for existing general-expense/contribution rows (confirmed
  test data, safe to reset).
- Amount-reconciliation for deposit status (existence check only, per
  decision above).
- **Reports/PDF Bank Fund numbers**: `/api/reports` and its PDF keep
  computing Bank Fund opening/closing balance with the old
  `opening + contributions − paid expenses` formula, unchanged by this
  phase. Once this ships, that figure will disagree with the Bank
  screen/Dashboard's new deposit/withdrawal-based Bank Balance — an
  accepted, known inconsistency until Reports gets its own dedicated
  enhancement pass (already flagged as needed in `RoadMap.md`). No
  real-world impact yet since existing data is test data being reset.
