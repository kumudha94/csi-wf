# CSI-WF Treasurer App — Design

## Purpose

A simple mobile app for a single treasurer (the user's mom) of a women's
fellowship (CSI-WF) to manage member records, track member dues/contributions,
log event and general expenses, and view balance/reports. Single-user,
personal-scale app — no multi-tenant or multi-role concerns.

## Stack

Mirrors the existing `KitchenPlanner` / `ddc_management` pattern so the build
reuses known-working conventions:

- **Backend:** Node/Express + TypeScript, Drizzle ORM, Postgres (Neon),
  deployed to Render (free tier), JWT auth
- **Mobile:** Expo (React Native)
- **File storage:** Cloudinary, for expense receipt photos
- **Auth:** Single JWT-protected account created on first launch; gated behind
  an on-device PIN screen. No multi-user roles/permissions.
- **Language:** English UI throughout. All text inputs accept Unicode
  (Tamil names/notes) with no restriction — this needs no special handling
  beyond using standard text inputs.

## Data Model

| Table | Fields | Notes |
|---|---|---|
| `members` | `id`, `name`, `santha_number` (unique), `phone`, `address`, `age` | Fixed core fields, real columns |
| `attribute_definitions` | `id`, `key`, `label`, `type` | Custom fields added later via Settings; `type` e.g. `text`/`number`/`date` |
| `member_attribute_values` | `id`, `member_id`, `attribute_key`, `value` | EAV rows, populated only once custom attributes exist |
| `events` | `id`, `name`, `details` | Created first; expenses attach afterward |
| `expenses` | `id`, `event_id` (nullable), `description`, `amount`, `receipt_photo_url` (nullable), `status` (`paid`\|`pending`), `date` | `event_id` null = general/non-event expense |
| `contributions` | `id`, `member_id`, `amount`, `date`, `note` (nullable) | Member dues; amount is variable, no fixed expected schedule |
| `settings` | single row: `opening_balance` | One-time starting figure set during onboarding |

**Balance formula** (always computed, never cached):

```
balance = opening_balance + Σ(contributions.amount) − Σ(expenses.amount WHERE status = 'paid')
```

Pending expenses are surfaced separately (e.g. "₹X pending / owed") and do
not affect the balance until flipped to `paid`.

## Screens

1. **Members** — searchable list (by name or santha number); tap to
   view/edit; add form with the 5 fixed fields + any configured custom
   attributes; delete with confirmation.
2. **Events** — list of events; tap → event detail showing its expense list.
   Add expense: description/reason, amount, optional receipt photo,
   paid/pending status. Event card shows running total spent (paid only).
3. **Balance** — current balance at top (computed per formula above).
   Two sub-sections:
   - *Contributions*: add a dues payment (pick member, amount, date, note)
   - *General Expenses*: same expense form as events, but `event_id = null`
4. **Reports** — date-range filter; totals for contributions, paid
   expenses, pending expenses, and closing balance, broken down by
   event/general. "Share/Export PDF" generates a printable/shareable
   summary (for annual meetings or treasurer handover).
5. **Settings** — set/edit opening balance; manage custom member attributes
   (add key/label/type); change PIN.

**App entry:** PIN screen on launch/resume → tabs. First-ever launch runs a
short onboarding: set opening balance, then set PIN.

## Error Handling

- Standard API validation (required fields, amount > 0, unique santha
  number) surfaced as inline form errors — no silent failures.
- Photo upload failures show a retry-able error without blocking the rest
  of the expense form (photo is optional).
- Network errors on a single-user personal app: show a simple retry
  banner; no offline queue/sync needed given this is a backend-backed app
  used in normal-connectivity conditions.

## Testing

- Backend: unit tests for the balance calculation (opening + contributions
  − paid expenses) and CRUD validation (unique santha number, required
  fields), since these are the parts most likely to have off-by-one or
  status-filtering bugs.
- Mobile: manual verification of each screen's golden path (add member,
  create event → add expense → mark paid, add contribution, view balance
  update, generate report) since this is a small personal app without an
  existing test harness to extend.

## Out of Scope (explicitly deferred)

- Multi-user accounts/roles
- Full Tamil UI translation (English UI is sufficient per user)
- Fixed/scheduled recurring dues billing (dues are variable/ad hoc)
- Event-level income (all income is via member contributions)
- Offline-first sync
