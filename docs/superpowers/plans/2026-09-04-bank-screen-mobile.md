# CSI-WF Bank Screen Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Balance tab to Bank and redesign its Bank Fund side around the real deposit → withdraw-to-hand → spend cycle (gradient balance card, Transfers/Contributions tabs), replacing one-at-a-time contribution entry with a fast collect-list flow that handles members paying in irregular multi-month gaps. Cash Fund, the outer fund switcher, and the rest of the tab bar are untouched.

**Architecture:** New `BankTransactionForm` (structurally similar to `ExpenseForm` — reuses its receipt-photo pattern — plus a 3-option transfer-type selector and no status field) and `ContributionCollectForm` (a member list driven by a new `/collection-status` endpoint, replacing `ContributionForm`). `BalanceScreen`'s `BankFundView` sub-component is rewritten to show the new gradient card and mount these two. The outer Bank Fund/Cash Fund switcher and `CashFundPanel` are untouched. `App.tsx`'s tab label/icon changes from Balance to Bank. `DashboardScreen`'s Account details card is updated to match the new Bank Balance/Balance-in-Hand shape.

**Tech Stack:** Expo (React Native), TanStack Query, React Navigation — same as the existing mobile app, no new dependencies. No test runner is configured for this app (per the original spec); verification is `npx tsc --noEmit` plus manual golden-path checks in Expo.

**Spec:** `docs/superpowers/specs/2026-09-04-bank-screen-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-04-bank-screen-backend.md` — its Tasks 3, 4, 6, 7 change/add the `/api/bank-transactions`, `/api/balance`, `/api/contributions/collection-status`, `/api/contributions/collect`, and `/api/dashboard` endpoints this plan's Tasks 1, 2, 3, 6 consume. The backend must be deployed (or running locally at the URL this app points to) before those tasks can be manually verified end-to-end.

## Global Constraints

- All API calls go through `apiRequest<T>()` from `mobile/src/lib/api.ts` — no direct `fetch()` calls (receipt upload is the one existing exception, via `uploadReceipt()`, which itself goes through `fetch` internally — reuse it, don't re-implement it).
- Every list row follows the existing Members/Contributions/Expenses convention: tap the row to open it pre-filled in the same form for editing (or, for the new Transfers list, the same `BankTransactionForm`); a trailing trash icon (`Ionicons name="trash-outline"`) opens a destructive `Alert.alert` confirmation before deleting. **Exception, deliberate per the design spec:** the Contributions collect-list has no delete action — it's a member-centric collection view, not a per-transaction list, and the mockups that drove this design show no delete control there. Only the Transfers list gets delete.
- Every mutation invalidates `["balance"]` and `["reports"]` on success, alongside its own resource's query key.
- Currency formatting always goes through `formatCurrency()` from `mobile/src/lib/format.ts`; dates always through `todayString()`/`dateToString()`.
- Every screen/component reads colors via `useTheme()` and builds its `StyleSheet` with `useMemo(() => createStyles(colors), [colors])` — never hardcoded colors.
- The Bank Fund/Cash Fund switcher inside `BalanceScreen.tsx`, and `CashFundPanel.tsx` behind it, are **not touched** by this plan — Cash Fund redesign is a separate future phase.
- `ContributionForm.tsx` is deleted once nothing imports it any more (Task 4) — its replacement is `ContributionCollectForm.tsx`.

---

### Task 1: Types for the Bank screen redesign

**Files:**
- Modify: `mobile/src/lib/types.ts`

**Interfaces:**
- Produces: `BankTransactionType`, `BankTransaction`, `MemberCollectionStatus`, updated `Contribution` (adds `forMonth`), updated `BankFundBalance` (new shape), updated `DashboardSummary["bank"]` — consumed by every later task in this plan.

- [ ] **Step 1: Add `forMonth` to `Contribution`**

In `mobile/src/lib/types.ts`, update the existing `Contribution` type:

```ts
export type Contribution = {
  id: number;
  memberId: number;
  amount: number;
  date: string;
  forMonth: string;
  note: string | null;
  createdAt: string;
};
```

- [ ] **Step 2: Add `BankTransaction` types**

After the `Contribution` type, insert:

```ts
export type BankTransactionType = "deposit" | "withdrawal" | "cash_expense";

export type BankTransaction = {
  id: number;
  type: BankTransactionType;
  description: string;
  amount: number;
  date: string;
  receiptPhotoUrl: string | null;
  createdAt: string;
};
```

- [ ] **Step 3: Add `MemberCollectionStatus`**

Right after the `BankTransaction` type, insert:

```ts
export type MemberCollectionStatus = {
  memberId: number;
  name: string;
  santhaNumber: string;
  defaultAmount: number;
  paidThisMonth: boolean;
  currentMonthContributionId: number | null;
  currentMonthAmount: number | null;
  currentMonthDate: string | null;
  missingMonths: string[];
};
```

- [ ] **Step 4: Replace `BankFundBalance` with the new shape**

Replace the existing `BankFundBalance` type:

```ts
export type BankFundBalance = {
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  balance: number;
  balanceInHand: number;
  depositStatus: { monthLabel: string; completed: boolean };
};
```

(`CashFundBalanceSummary` and `BalanceResponse` stay exactly as they are — only `BankFundBalance`'s internal shape changes.)

- [ ] **Step 5: Update `DashboardSummary["bank"]`**

Replace the `bank` field in `DashboardSummary`:

```ts
export type DashboardSummary = {
  monthLabel: string;
  weekOfMonth: number;
  bank: { balance: number; inHand: number; depositStatus: { monthLabel: string; completed: boolean } };
  cash: { balance: number };
  members: { total: number; active: number; inactive: number; died: number; newThisMonth: number };
  contributions: { thisMonth: number; thisWeek: number; total: number };
  offering: { thisMonth: number; thisWeek: number; total: number };
};
```

- [ ] **Step 6: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors in `BalanceScreen.tsx`, `DashboardScreen.tsx`, `ContributionForm.tsx` (all reference the old shapes) — expected, fixed in Tasks 3, 4, 6.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/types.ts
git commit -m "feat: add bank transaction and contribution collection types"
```

---

### Task 2: `BankTransactionForm` — deposit/withdrawal/cash-expense entry

**Files:**
- Create: `mobile/src/components/BankTransactionForm.tsx`

**Interfaces:**
- Consumes: `BankTransaction`, `BankTransactionType` (Task 1); `apiRequest`, `uploadReceipt` (`mobile/src/lib/api.ts`); `todayString`/`dateToString` (`mobile/src/lib/format.ts`); `useTheme`.
- Produces: `<BankTransactionForm visible onClose transaction? />` — mounted by `BalanceScreen` (Task 4).

- [ ] **Step 1: Create the component**

`mobile/src/components/BankTransactionForm.tsx` — mirrors `ExpenseForm.tsx`'s receipt-photo mechanics exactly, with a 3-option type selector (stacked vertically — the app has no dropdown/picker dependency, and the option labels are too long to fit as a horizontal row like `CashIncomeForm`'s type toggle) instead of a status toggle:

```tsx
import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest, uploadReceipt } from "../lib/api";
import type { BankTransaction, BankTransactionType } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; transaction?: BankTransaction | null };

const TYPE_OPTIONS: { value: BankTransactionType; label: string }[] = [
  { value: "deposit", label: "Transfer to account" },
  { value: "withdrawal", label: "Transfer from account" },
  { value: "cash_expense", label: "Debit from cash which is transferred from account" },
];

export default function BankTransactionForm({ visible, onClose, transaction }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!transaction;

  const [type, setType] = useState<BankTransactionType>("deposit");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(transaction?.type || "deposit");
      setDescription(transaction?.description || "");
      setAmount(transaction ? String(transaction.amount) : "");
      setDate(transaction?.date || todayString());
      setReceiptUri(null);
      setReceiptUrl(transaction?.receiptPhotoUrl || null);
    }
  }, [visible, transaction]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const removeReceipt = () => {
    setReceiptUri(null);
    setReceiptUrl(null);
  };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setReceiptUri(result.assets[0].uri);
    setIsUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUrl(url);
    } catch (error: any) {
      Alert.alert("Upload failed", error.message || "Could not upload the receipt photo");
      setReceiptUri(null);
    } finally {
      setIsUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        type,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        receiptPhotoUrl: receiptUrl,
      };
      if (isEditing) {
        return apiRequest(`/api/bank-transactions/${transaction!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/bank-transactions", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save transfer", error.message || "Something went wrong"),
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Missing description", "Enter what this transfer was for.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.title}>{isEditing ? "Edit Transfer" : "Add Transfer"}</Text>

          <Text style={styles.label}>Transfer type *</Text>
          <View style={styles.typeList}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeOptionRow, type === opt.value && styles.typeOptionRowActive]}
                onPress={() => setType(opt.value)}
              >
                <Text style={[styles.typeOptionRowText, type === opt.value && styles.typeOptionRowTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Reason / Description *</Text>
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="What was this for?" />

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date *</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowDatePicker(true)}>
              <Text style={{ color: colors.textPrimary }}>{date}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calendarButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <Text style={styles.label}>Receipt / voucher photo</Text>
          {receiptUri || receiptUrl ? (
            <View style={styles.receiptPreviewRow}>
              <Image source={{ uri: receiptUri || receiptUrl! }} style={styles.receiptPreview} />
              <TouchableOpacity style={styles.removeReceiptButton} onPress={removeReceipt} disabled={isUploading}>
                <Text style={styles.removeReceiptButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity style={styles.photoButton} onPress={pickReceipt} disabled={isUploading}>
            <Text style={styles.photoButtonText}>{isUploading ? "Uploading..." : "Choose Photo"}</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending || isUploading}>
              <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    justifyContent: "center",
  },
  typeList: { gap: 8 },
  typeOptionRow: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface },
  typeOptionRowActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionRowText: { color: colors.textSecondary, fontWeight: "600" },
  typeOptionRowTextActive: { color: colors.primary },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  calendarButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  receiptPreviewRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 10, marginTop: 8 },
  receiptPreview: { width: 120, height: 120, borderRadius: 8 },
  removeReceiptButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  removeReceiptButtonText: { color: colors.danger, fontWeight: "600" },
  photoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
    marginTop: 8,
  },
  photoButtonText: { color: colors.textSecondary, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/BankTransactionForm.tsx
git commit -m "feat: add bank transfer form (deposit/withdrawal/cash expense)"
```

---

### Task 3: `ContributionCollectForm` — collect-list with gap handling

**Files:**
- Create: `mobile/src/components/ContributionCollectForm.tsx`
- Modify: `mobile/src/lib/format.ts`

**Interfaces:**
- Consumes: `MemberCollectionStatus` (Task 1); `GET /api/contributions/collection-status`, `POST /api/contributions/collect`, `PATCH /api/contributions/:id` (backend plan Tasks 4, 6); `apiRequest`, `formatCurrency`, `useTheme`.
- Produces: `<ContributionCollectForm />` — mounted by `BalanceScreen` (Task 4). Self-contained: no props, fetches and mutates its own data. `lastSundayOrToday(date?: Date): string` in `mobile/src/lib/format.ts` — consumed only here.

- [ ] **Step 1: Add the default-collection-date helper**

In `mobile/src/lib/format.ts`, append:

```ts
// Default date for a contribution collected today: if today is Sunday, use
// today; otherwise the most recent past Sunday. Matches how the fellowship
// actually dates a "this week's collection" entry.
export function lastSundayOrToday(date: Date = new Date()): string {
  const result = new Date(date);
  result.setDate(date.getDate() - date.getDay());
  return dateToString(result);
}
```

- [ ] **Step 2: Create the component**

`mobile/src/components/ContributionCollectForm.tsx`:

```tsx
import { useState, useMemo } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { MemberCollectionStatus } from "../lib/types";
import { formatCurrency, dateToString, lastSundayOrToday } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ContributionCollectForm() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [editingMember, setEditingMember] = useState<MemberCollectionStatus | null>(null);

  const { data: status = [], isError } = useQuery({
    queryKey: ["contributionCollectionStatus"],
    queryFn: () => apiRequest<MemberCollectionStatus[]>("/api/contributions/collection-status"),
  });

  const summary = useMemo(() => {
    let collectedAmount = 0;
    let collectedCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    for (const m of status) {
      if (m.paidThisMonth) {
        collectedAmount += m.currentMonthAmount ?? 0;
        collectedCount += 1;
      }
      if (m.missingMonths.length > 0) {
        pendingAmount += m.defaultAmount * m.missingMonths.length;
        pendingCount += 1;
      }
    }
    return { collectedAmount, collectedCount, pendingAmount, pendingCount };
  }, [status]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return status;
    return status.filter(
      (m) => m.name.toLowerCase().includes(query) || m.santhaNumber.toLowerCase().includes(query)
    );
  }, [status, search]);

  const collectMutation = useMutation({
    mutationFn: ({ memberId, totalAmount }: { memberId: number; totalAmount: number }) =>
      apiRequest("/api/contributions/collect", {
        method: "POST",
        body: JSON.stringify({ memberId, totalAmount, date: lastSundayOrToday() }),
      }),
    onSuccess: (_data, variables) => {
      setAmounts((prev) => {
        const next = { ...prev };
        delete next[variables.memberId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["contributionCollectionStatus"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not record payment", error.message || "Something went wrong"),
  });

  const handleAdd = (member: MemberCollectionStatus) => {
    const displayed = amounts[member.memberId] ?? String(member.defaultAmount * member.missingMonths.length);
    const parsed = parseFloat(displayed);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    collectMutation.mutate({ memberId: member.memberId, totalAmount: parsed });
  };

  const monthLabel = MONTH_NAMES[new Date().getMonth()];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Total contribution</Text>
        <Text style={styles.summaryText}>
          Collected {formatCurrency(summary.collectedAmount)} from {summary.collectedCount} members for this {monthLabel} month
        </Text>
        <Text style={[styles.summaryTitle, { marginTop: 10 }]}>Pending contribution to be collected</Text>
        <Text style={styles.summaryText}>
          Amount {formatCurrency(summary.pendingAmount)} from {summary.pendingCount} members
        </Text>
      </View>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or santha number"
      />
      {isError ? <Text style={styles.errorText}>Could not load members.</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(m) => String(m.memberId)}
        renderItem={({ item }) => {
          const owed = item.defaultAmount * item.missingMonths.length;
          const displayedAmount = item.paidThisMonth
            ? String(item.currentMonthAmount ?? 0)
            : amounts[item.memberId] ?? String(owed);

          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{item.name}</Text>
                <Text style={styles.memberMeta}>
                  Santha No: {item.santhaNumber} : Santha amount: {formatCurrency(item.defaultAmount)}
                </Text>
                {!item.paidThisMonth && item.missingMonths.length > 1 ? (
                  <Text style={styles.gapText}>
                    Santha amount pending for {item.missingMonths.length} months, santha amount is {formatCurrency(item.defaultAmount)}
                  </Text>
                ) : null}
              </View>
              <TextInput
                style={styles.amountInput}
                value={displayedAmount}
                onChangeText={(text) => setAmounts((prev) => ({ ...prev, [item.memberId]: text }))}
                keyboardType="decimal-pad"
                editable={!item.paidThisMonth}
              />
              <TouchableOpacity
                style={[styles.actionButton, item.paidThisMonth && styles.actionButtonPaid]}
                onPress={() => (item.paidThisMonth ? setEditingMember(item) : handleAdd(item))}
                disabled={collectMutation.isPending}
              >
                <Text style={styles.actionButtonText}>{item.paidThisMonth ? "Paid" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      />

      <ContributionEditModal visible={!!editingMember} onClose={() => setEditingMember(null)} member={editingMember} />
    </View>
  );
}

function ContributionEditModal({
  visible,
  onClose,
  member,
}: {
  visible: boolean;
  onClose: () => void;
  member: MemberCollectionStatus | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useMemo(() => {
    if (visible && member) {
      setAmount(member.currentMonthAmount != null ? String(member.currentMonthAmount) : "");
      setDate(member.currentMonthDate || lastSundayOrToday());
    }
  }, [visible, member]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = parseFloat(amount);
      return apiRequest(`/api/contributions/${member!.currentMonthContributionId}`, {
        method: "PATCH",
        body: JSON.stringify({ amount: parsed, date }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributionCollectionStatus"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not update contribution", error.message || "Something went wrong"),
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  if (!member) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.title}>Edit Contribution</Text>
          <Text style={styles.memberMeta}>{member.name} · Santha No: {member.santhaNumber}</Text>

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.editInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.editInput} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{date}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleSubmit} disabled={saveMutation.isPending}>
              <Text style={styles.actionButtonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  editInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  summaryCard: { backgroundColor: colors.primarySoft, margin: 16, marginBottom: 8, padding: 16, borderRadius: 10 },
  summaryTitle: { fontWeight: "700", color: colors.textPrimary },
  summaryText: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, color: colors.textPrimary },
  errorText: { color: colors.danger, fontSize: 12, marginHorizontal: 16, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  memberMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  gapText: { fontSize: 11, color: colors.danger, marginTop: 4 },
  amountInput: { width: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, textAlign: "right", color: colors.textPrimary, backgroundColor: colors.background },
  actionButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
  actionButtonPaid: { backgroundColor: colors.success },
  actionButtonText: { color: colors.white, fontWeight: "700" },
  secondaryButton: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing these two files (it isn't imported anywhere yet — Task 4 wires it in).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/ContributionCollectForm.tsx mobile/src/lib/format.ts
git commit -m "feat: add contribution collect-list with gap-fill handling"
```

---

### Task 4: `BalanceScreen` — Bank redesign

**Files:**
- Modify: `mobile/src/screens/BalanceScreen.tsx`
- Delete: `mobile/src/components/ContributionForm.tsx`

**Interfaces:**
- Consumes: `BalanceResponse` (Task 1, new `bankFund` shape); `BankTransaction` (Task 1); `BankTransactionForm` (Task 2); `ContributionCollectForm` (Task 3).
- Produces: the Bank Fund side of the switcher now shows the gradient balance card and Transfers/Contributions tabs. The outer Bank Fund/Cash Fund switcher, and everything under Cash Fund (`CashFundPanel`), are unchanged.

- [ ] **Step 1: Confirm nothing else imports `ContributionForm`**

```bash
grep -rl "ContributionForm" mobile/src --include="*.tsx"
```

Expected: only `mobile/src/components/ContributionForm.tsx` and `mobile/src/screens/BalanceScreen.tsx` — confirming it's safe to delete once this task rewrites `BalanceScreen.tsx`.

- [ ] **Step 2: Rewrite `BalanceScreen.tsx`**

Replace the contents of `mobile/src/screens/BalanceScreen.tsx`:

```tsx
import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, BankTransaction } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import BankTransactionForm from "../components/BankTransactionForm";
import ContributionCollectForm from "../components/ContributionCollectForm";
import CashFundPanel from "../components/CashFundPanel";

type Fund = "bank" | "cash";
type BankTab = "transfers" | "contributions";

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fund, setFund] = useState<Fund>("bank");

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });

  return (
    <View style={styles.container}>
      <View style={styles.fundRow}>
        <TouchableOpacity style={[styles.fundButton, fund === "bank" && styles.fundButtonActive]} onPress={() => setFund("bank")}>
          <Text style={[styles.fundButtonText, fund === "bank" && styles.fundButtonTextActive]}>Bank Fund</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fundButton, fund === "cash" && styles.fundButtonActive]} onPress={() => setFund("cash")}>
          <Text style={[styles.fundButtonText, fund === "cash" && styles.fundButtonTextActive]}>Cash Fund</Text>
        </TouchableOpacity>
      </View>

      {fund === "bank" ? (
        <BankFundView balance={balance} balanceIsError={balanceIsError} />
      ) : (
        <CashFundPanel />
      )}
    </View>
  );
}

function BankFundView({ balance, balanceIsError }: { balance?: BalanceResponse; balanceIsError: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BankTab>("transfers");
  const [transactionFormVisible, setTransactionFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BankTransaction | null>(null);

  const bankFund = balance?.bankFund;

  const { data: transactions = [], isError: transactionsIsError } = useQuery({
    queryKey: ["bankTransactions"],
    queryFn: () => apiRequest<BankTransaction[]>("/api/bank-transactions"),
    enabled: tab === "transfers",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/bank-transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete transfer", error.message),
  });

  const confirmDelete = (transaction: BankTransaction) => {
    Alert.alert("Delete transfer", `Remove "${transaction.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(transaction.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.balanceCard}>
        {balanceIsError || !bankFund ? (
          <Text style={styles.balanceValue}>Could not load balance.</Text>
        ) : (
          <>
            <Text style={styles.balanceLabel}>Bank Balance : {formatCurrency(bankFund.balance)}</Text>
            <Text style={styles.balanceLabel}>Bank balance in hand : {formatCurrency(bankFund.balanceInHand)}</Text>
            <Text style={styles.depositStatus}>
              {bankFund.depositStatus.monthLabel} month deposit {bankFund.depositStatus.completed ? "completed" : "pending"}
            </Text>
          </>
        )}
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "transfers" && styles.tabButtonActive]} onPress={() => setTab("transfers")}>
          <Text style={[styles.tabButtonText, tab === "transfers" && styles.tabButtonTextActive]}>Transfers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "contributions" && styles.tabButtonActive]} onPress={() => setTab("contributions")}>
          <Text style={[styles.tabButtonText, tab === "contributions" && styles.tabButtonTextActive]}>Contributions</Text>
        </TouchableOpacity>
      </View>

      {tab === "transfers" ? (
        <>
          <FlatList
            data={transactions}
            keyExtractor={(t) => String(t.id)}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardContent}
                  onPress={() => {
                    setEditingTransaction(item);
                    setTransactionFormVisible(true);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.description}</Text>
                    <Text style={styles.cardMeta}>{item.date}</Text>
                  </View>
                  <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>{transactionsIsError ? "Could not load transfers." : "No transfers yet."}</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          />

          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              setEditingTransaction(null);
              setTransactionFormVisible(true);
            }}
          >
            <Text style={styles.fabText}>+ Add Transfer</Text>
          </TouchableOpacity>

          <BankTransactionForm
            visible={transactionFormVisible}
            onClose={() => setTransactionFormVisible(false)}
            transaction={editingTransaction}
          />
        </>
      ) : (
        <ContributionCollectForm />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12 },
  balanceLabel: { color: colors.white, fontSize: 16, fontWeight: "700", marginTop: 4 },
  balanceValue: { color: colors.white, fontSize: 18, fontWeight: "700" },
  depositStatus: { color: colors.primarySoft, fontSize: 12, marginTop: 12, fontWeight: "600" },
  fundRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 16, gap: 8 },
  fundButton: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fundButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  fundButtonText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  fundButtonTextActive: { color: colors.white },
  tabRow: { flexDirection: "row", margin: 16, gap: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabButtonText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  tabButtonTextActive: { color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" },
  cardContent: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deleteButton: { paddingLeft: 12, marginLeft: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardAmount: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  fabText: { color: colors.white, fontWeight: "700" },
});
```

Note the balance card intentionally moved above the fund switcher inside `BankFundView` (it's Bank-specific — Bank Balance/Balance in Hand mean nothing for Cash Fund) rather than shared above the switcher the way the single "Balance" number used to be.

- [ ] **Step 3: Delete `ContributionForm.tsx`**

```bash
rm mobile/src/components/ContributionForm.tsx
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With the backend from the paired backend plan running and `EXPO_PUBLIC_API_URL` pointed at it, run `cd mobile && npm start`:
- Confirm the Bank Fund side shows the gradient card (Bank Balance, Balance in Hand, deposit status) and defaults to the Transfers tab.
- Add a deposit, a withdrawal, and a cash expense via "+ Add Transfer" — confirm the balance card updates correctly after each, and each shows up in the Transfers list; edit one, delete one.
- Switch to the Contributions tab — confirm the summary card and member list render from `/collection-status`; tap Add on an unpaid member, confirm it posts and the row flips to "Paid"; tap a paid row, confirm the edit modal opens pre-filled, save a change, confirm it persists.
- Switch to Cash Fund — confirm it's unchanged from before this plan.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/BalanceScreen.tsx
git rm mobile/src/components/ContributionForm.tsx
git commit -m "feat: redesign bank fund screen (gradient card, transfers, contribution collect-list)"
```

---

### Task 5: `App.tsx` — rename the tab to Bank

**Files:**
- Modify: `mobile/App.tsx`

**Interfaces:**
- Consumes: nothing new — this only relabels an existing tab, no shape changes.

- [ ] **Step 1: Rename the tab**

In `mobile/App.tsx`, the `TabParamList` type still names the route `Balance` (React Navigation route names are internal identifiers, not the mobile plan's concern to rename — only the visible label changes). Update the icon condition and add a `tabBarLabel` override:

```tsx
          else if (route.name === "Balance") iconName = "business";
```

(was `"wallet"` — `"wallet"` reads more like the old single-balance concept; `"business"` (a bank-building glyph in Ionicons) better matches "Bank". If a different icon name is preferred at review time, any valid `Ionicons.glyphMap` key works here — this is a cosmetic choice, not a contract other code depends on.)

Then add `tabBarLabel: "Bank"` to that tab's `options`:

```tsx
      <Tab.Screen name="Balance" component={BalanceScreen} options={{ tabBarLabel: "Bank" }} />
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run the app, confirm the bottom tab bar shows "Bank" (not "Balance") in that position, with the new icon, and it still opens the same screen from Task 4.

- [ ] **Step 4: Commit**

```bash
git add mobile/App.tsx
git commit -m "feat: rename balance tab to bank"
```

---

### Task 6: `DashboardScreen` — Bank Balance / Balance in Hand

**Files:**
- Modify: `mobile/src/screens/DashboardScreen.tsx`

**Interfaces:**
- Consumes: `DashboardSummary["bank"]` new shape (Task 1; backend plan Task 7).

- [ ] **Step 1: Update the Account details card**

In `mobile/src/screens/DashboardScreen.tsx`, replace the Bank balance row inside the "Account details" card:

```tsx
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Bank balance</Text>
              <Text style={styles.balanceValue}>{mask(data.bank.balance)}</Text>
              <Text style={styles.pendingText}>Balance in hand: {mask(data.bank.inHand)}</Text>
              <Text style={styles.pendingText}>
                {data.bank.depositStatus.monthLabel} deposit {data.bank.depositStatus.completed ? "completed" : "pending"}
              </Text>
            </View>
```

(was the block with `Text style={styles.pendingText}>Pending: {mask(data.bank.pending)}</Text>` — that field no longer exists on `DashboardSummary`.)

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors anywhere in the mobile app.

- [ ] **Step 3: Manual verification**

Open the Dashboard tab, confirm the Account details card shows Bank balance, Balance in hand, and the deposit status line, all matching what the Bank screen (Task 4) and `/api/balance` (backend plan Task 4) show for the same data.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/DashboardScreen.tsx
git commit -m "feat: show balance-in-hand and deposit status on dashboard"
```
