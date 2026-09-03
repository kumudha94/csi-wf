# CSI-WF Cash Fund Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cash Fund view to the mobile app — a fund switcher on the Balance screen, forms to log Offering/Donation (with donor-name autocomplete against members) and meeting expenses, tap-to-edit/trash-to-delete on every row, and a Cash Fund section on Reports and Settings.

**Architecture:** New `CashIncomeForm` and `CashExpenseForm` components mirror the existing `ContributionForm`/`ExpenseForm` exactly (same modal/form/mutation pattern). A new `CashFundPanel` component holds the Income/Expenses tabs for the Cash Fund, parallel to what `BalanceScreen` already does for the Bank Fund. `BalanceScreen` gains a top-level fund switcher that swaps between its existing content (now conceptually "Bank Fund") and `CashFundPanel`.

**Tech Stack:** Expo (React Native), TanStack Query, React Navigation — same as the existing mobile app, no new dependencies. No test runner is configured for this app (per the original spec); verification is `npx tsc --noEmit` plus manual golden-path checks in Expo.

**Spec:** `docs/superpowers/specs/2026-09-03-cash-fund-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-03-csi-wf-cash-fund-backend.md` — Tasks 5, 6 and 7 of that plan change the `/api/balance`, `/api/settings`, and `/api/reports` response shapes that this plan's Tasks 5, 6, 7 consume. The backend must be deployed (or running locally at the URL this app points to) before those tasks can be manually verified end-to-end.

## Global Constraints

- All API calls go through `apiRequest<T>()` from `mobile/src/lib/api.ts` — no direct `fetch()` calls.
- Every list row (Cash Fund included) follows the existing Members/Contributions/Expenses convention: tap the row to open it pre-filled in the same form for editing; a trailing trash icon (`Ionicons name="trash-outline"`) opens a destructive `Alert.alert` confirmation before deleting.
- Every mutation invalidates `["balance"]` and `["reports"]` on success, alongside its own resource's query key — every screen that shows a balance or report figure must reflect the change immediately.
- Currency formatting always goes through `formatCurrency()` from `mobile/src/lib/format.ts`; dates always through `todayString()`/`dateToString()`.
- Every screen/component reads colors via `useTheme()` and builds its `StyleSheet` with `useMemo(() => createStyles(colors), [colors])` — never hardcoded colors.
- Donor-name autocomplete reuses the exact pattern already in `ContributionForm.tsx`'s member field (local filter of an already-fetched list, dropdown of matches, tap to fill) — the only difference is that selecting a suggestion is optional here, since `donorName` is free text with no FK.

---

### Task 1: Types for the Cash Fund API

**Files:**
- Modify: `mobile/src/lib/types.ts`

**Interfaces:**
- Produces: `CashIncomeType`, `CashFundIncome`, `CashFundExpense`, `BankFundBalance`, `CashFundBalance`, `BalanceResponse` (changed shape), `ReportCashIncomeRow`, `ReportCashExpenseRow`, `ReportResponse` (extended) — consumed by every later task in this plan.

- [ ] **Step 1: Add Cash Fund entity types**

After the `Contribution` type in `mobile/src/lib/types.ts`, insert:

```ts
export type CashIncomeType = "offering" | "donation";

export type CashFundIncome = {
  id: number;
  type: CashIncomeType;
  amount: number;
  date: string;
  donorName: string | null;
  note: string | null;
  createdAt: string;
};

export type CashFundExpense = {
  id: number;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
};
```

- [ ] **Step 2: Replace `BalanceResponse` with the two-fund shape**

Replace the existing `BalanceResponse` type with:

```ts
export type BankFundBalance = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  balance: number;
};

export type CashFundBalanceSummary = {
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
};

export type BalanceResponse = {
  bankFund: BankFundBalance;
  cashFund: CashFundBalanceSummary;
};
```

- [ ] **Step 3: Extend `ReportResponse`**

Add these types after `ReportContributionRow`:

```ts
export type ReportCashIncomeRow = {
  type: CashIncomeType;
  amount: number;
  date: string;
  donorName: string | null;
  note: string | null;
};

export type ReportCashExpenseRow = {
  description: string;
  amount: number;
  date: string;
};

export type ReportCashFund = {
  openingBalance: number;
  totalIncome: number;
  totalOffering: number;
  totalDonation: number;
  totalExpenses: number;
  closingBalance: number;
  income: ReportCashIncomeRow[];
  expenses: ReportCashExpenseRow[];
};
```

Then add a `cashFund: ReportCashFund;` field to `ReportResponse`.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors in `BalanceScreen.tsx`, `SettingsScreen.tsx`, `ReportsScreen.tsx` (they reference the old flat shapes) — expected, fixed in Tasks 5, 6, 7.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/types.ts
git commit -m "feat: add cash fund types"
```

---

### Task 2: `CashIncomeForm` — Offering/Donation entry with donor autocomplete

**Files:**
- Create: `mobile/src/components/CashIncomeForm.tsx`

**Interfaces:**
- Consumes: `CashFundIncome`, `CashIncomeType`, `Member` (Task 1, `mobile/src/lib/types.ts`); `apiRequest` (`mobile/src/lib/api.ts`); `todayString`/`dateToString` (`mobile/src/lib/format.ts`); `useTheme` (`mobile/src/contexts/ThemeContext.tsx`).
- Produces: `<CashIncomeForm visible onClose income? />` — mounted by `CashFundPanel` (Task 4).

- [ ] **Step 1: Create the component**

`mobile/src/components/CashIncomeForm.tsx` — this mirrors `ContributionForm.tsx` structurally: same member-suggestion mechanics for `donorName`, but selection is optional (no `selectedMember` gate on submit), plus a type toggle copied from `ExpenseForm.tsx`'s status toggle:

```tsx
import { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { Member, CashFundIncome, CashIncomeType } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; income?: CashFundIncome | null };

const TYPE_OPTIONS: { value: CashIncomeType; label: string }[] = [
  { value: "offering", label: "Offering" },
  { value: "donation", label: "Donation" },
];

export default function CashIncomeForm({ visible, onClose, income }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!income;

  const [type, setType] = useState<CashIncomeType>("offering");
  const [donorName, setDonorName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const { data: members = [] } = useQuery({
    queryKey: ["members", ""],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible && type === "donation",
  });

  useEffect(() => {
    if (visible) {
      setType(income?.type || "offering");
      setDonorName(income?.donorName || "");
      setAmount(income ? String(income.amount) : "");
      setDate(income?.date || todayString());
      setNote(income?.note || "");
      setShowSuggestions(false);
    }
  }, [visible, income]);

  const memberMatches = useMemo(() => {
    const query = donorName.trim().toLowerCase();
    if (!query) return [];
    return members.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 6);
  }, [members, donorName]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        type,
        amount: parseFloat(amount),
        date,
        donorName: type === "donation" ? donorName.trim() || null : null,
        note: note.trim() || null,
      };
      if (isEditing) {
        return apiRequest(`/api/cash-fund-income/${income!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/cash-fund-income", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["cashFundIncome"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save entry", error.message),
  });

  const handleSubmit = () => {
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
          <Text style={styles.title}>{isEditing ? "Edit Entry" : "Add Offering / Donation"}</Text>

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeOption, type === opt.value && styles.typeOptionActive]}
                onPress={() => setType(opt.value)}
              >
                <Text style={[styles.typeOptionText, type === opt.value && styles.typeOptionTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {type === "donation" && (
            <>
              <Text style={styles.label}>Donor name (optional)</Text>
              <TextInput
                style={styles.input}
                value={donorName}
                onChangeText={(text) => {
                  setDonorName(text);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Type a name, or leave blank"
              />
              {showSuggestions && donorName.trim().length > 0 && memberMatches.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {memberMatches.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.suggestionRow}
                      onPress={() => {
                        setDonorName(m.name);
                        setShowSuggestions(false);
                      }}
                    >
                      <Text style={{ color: colors.textPrimary }}>{m.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.santhaNumber}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{date}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <Text style={styles.label}>Note</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Optional note" />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
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
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary, justifyContent: "center" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeOption: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surface },
  typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionText: { color: colors.textSecondary, fontWeight: "600" },
  typeOptionTextActive: { color: colors.primary },
  suggestionsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 4, backgroundColor: colors.surface },
  suggestionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
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
git add mobile/src/components/CashIncomeForm.tsx
git commit -m "feat: add cash income form with donor-name autocomplete"
```

---

### Task 3: `CashExpenseForm` — meeting expense entry

**Files:**
- Create: `mobile/src/components/CashExpenseForm.tsx`

**Interfaces:**
- Consumes: `CashFundExpense` (Task 1); `apiRequest`, `todayString`/`dateToString`, `useTheme`.
- Produces: `<CashExpenseForm visible onClose expense? />` — mounted by `CashFundPanel` (Task 4).

- [ ] **Step 1: Create the component**

`mobile/src/components/CashExpenseForm.tsx` — a stripped-down `ExpenseForm.tsx`: no status toggle, no receipt photo, no `eventId`:

```tsx
import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { CashFundExpense } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; expense?: CashFundExpense | null };

export default function CashExpenseForm({ visible, onClose, expense }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!expense;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setDescription(expense?.description || "");
      setAmount(expense ? String(expense.amount) : "");
      setDate(expense?.date || todayString());
    }
  }, [visible, expense]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { description: description.trim(), amount: parseFloat(amount), date };
      if (isEditing) {
        return apiRequest(`/api/cash-fund-expenses/${expense!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/cash-fund-expenses", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["cashFundExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save expense", error.message),
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Missing description", "Enter what this expense was for.");
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
          <Text style={styles.title}>{isEditing ? "Edit Expense" : "Add Meeting Expense"}</Text>

          <Text style={styles.label}>Reason / Description *</Text>
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Tea, snacks, auto fare..." />

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{date}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
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
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary },
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
git add mobile/src/components/CashExpenseForm.tsx
git commit -m "feat: add cash fund meeting-expense form"
```

---

### Task 4: `CashFundPanel` — Income/Expenses tabs and lists

**Files:**
- Create: `mobile/src/components/CashFundPanel.tsx`

**Interfaces:**
- Consumes: `CashFundIncome`, `CashFundExpense` (Task 1); `CashIncomeForm` (Task 2); `CashExpenseForm` (Task 3); `apiRequest`, `formatCurrency`, `useTheme`.
- Produces: `<CashFundPanel />` — mounted by `BalanceScreen` (Task 5) when the Cash Fund is selected. Self-contained: no props, fetches and mutates its own data (mirrors how `BalanceScreen`'s existing content is self-contained today).

- [ ] **Step 1: Create the component**

`mobile/src/components/CashFundPanel.tsx` — this mirrors the Bank Fund tab-row/list/FAB structure already in `BalanceScreen.tsx`, scoped to Cash Fund's two resources:

```tsx
import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { CashFundIncome, CashFundExpense } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import CashIncomeForm from "./CashIncomeForm";
import CashExpenseForm from "./CashExpenseForm";

type Tab = "income" | "expenses";

export default function CashFundPanel() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("income");
  const [incomeFormVisible, setIncomeFormVisible] = useState(false);
  const [expenseFormVisible, setExpenseFormVisible] = useState(false);
  const [editingIncome, setEditingIncome] = useState<CashFundIncome | null>(null);
  const [editingExpense, setEditingExpense] = useState<CashFundExpense | null>(null);

  const { data: income = [], isError: incomeIsError } = useQuery({
    queryKey: ["cashFundIncome"],
    queryFn: () => apiRequest<CashFundIncome[]>("/api/cash-fund-income"),
    enabled: tab === "income",
  });

  const { data: expenses = [], isError: expensesIsError } = useQuery({
    queryKey: ["cashFundExpenses"],
    queryFn: () => apiRequest<CashFundExpense[]>("/api/cash-fund-expenses"),
    enabled: tab === "expenses",
  });

  const deleteIncomeMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cash-fund-income/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashFundIncome"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete entry", error.message),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cash-fund-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashFundExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete expense", error.message),
  });

  const confirmDeleteIncome = (row: CashFundIncome) => {
    Alert.alert("Delete entry", `Remove this ${row.type} of ${formatCurrency(row.amount)}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteIncomeMutation.mutate(row.id) },
    ]);
  };

  const confirmDeleteExpense = (row: CashFundExpense) => {
    Alert.alert("Delete expense", `Remove "${row.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteExpenseMutation.mutate(row.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "income" && styles.tabButtonActive]} onPress={() => setTab("income")}>
          <Text style={[styles.tabButtonText, tab === "income" && styles.tabButtonTextActive]}>Offering / Donation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>Meeting Expenses</Text>
        </TouchableOpacity>
      </View>

      {tab === "income" ? (
        <FlatList
          data={income}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => {
                  setEditingIncome(item);
                  setIncomeFormVisible(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.type === "donation" ? item.donorName || "Donation" : "Offering"}</Text>
                  <Text style={styles.cardMeta}>{item.date}</Text>
                </View>
                <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteIncome(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{incomeIsError ? "Could not load entries." : "No offering or donation entries yet."}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => {
                  setEditingExpense(item);
                  setExpenseFormVisible(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.description}</Text>
                  <Text style={styles.cardMeta}>{item.date}</Text>
                </View>
                <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteExpense(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{expensesIsError ? "Could not load expenses." : "No meeting expenses yet."}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (tab === "income") {
            setEditingIncome(null);
            setIncomeFormVisible(true);
          } else {
            setEditingExpense(null);
            setExpenseFormVisible(true);
          }
        }}
      >
        <Text style={styles.fabText}>{tab === "income" ? "+ Add Offering / Donation" : "+ Add Expense"}</Text>
      </TouchableOpacity>

      <CashIncomeForm visible={incomeFormVisible} onClose={() => setIncomeFormVisible(false)} income={editingIncome} />
      <CashExpenseForm visible={expenseFormVisible} onClose={() => setExpenseFormVisible(false)} expense={editingExpense} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing this file (it isn't imported anywhere yet, so it can't yet be exercised — Task 5 wires it in).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/CashFundPanel.tsx
git commit -m "feat: add cash fund income/expenses panel"
```

---

### Task 5: `BalanceScreen` — fund switcher

**Files:**
- Modify: `mobile/src/screens/BalanceScreen.tsx`

**Interfaces:**
- Consumes: `BalanceResponse` (Task 1, new nested shape); `CashFundPanel` (Task 4).
- Produces: the Balance tab now shows a Bank Fund / Cash Fund switcher at the top; all existing Bank Fund functionality (Contributions, General Expenses, their forms) is unchanged, just relabeled and scoped under "Bank Fund".

**⚠️ Conflict note:** at spec-review time, this file had uncommitted changes from a separate in-progress session (adding an `AttributeForm`/`EventForm`-related change). Before starting this task, check `git status` on `mobile/src/screens/BalanceScreen.tsx` — if it's still dirty, get the other session's edits committed (or stashed and reconciled) first, since this task rewrites the whole file.

- [ ] **Step 1: Rewrite `BalanceScreen.tsx` with a fund switcher**

Replace the contents of `mobile/src/screens/BalanceScreen.tsx`:

```tsx
import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, Expense, Contribution } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import ContributionForm from "../components/ContributionForm";
import ExpenseForm from "../components/ExpenseForm";
import CashFundPanel from "../components/CashFundPanel";

type Fund = "bank" | "cash";
type BankTab = "contributions" | "expenses";

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fund, setFund] = useState<Fund>("bank");

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });

  const displayedBalance = fund === "bank" ? balance?.bankFund.balance : balance?.cashFund.balance;

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{fund === "bank" ? "Bank Fund Balance" : "Cash Fund Balance"}</Text>
        {balanceIsError ? (
          <Text style={styles.balanceValue}>Could not load balance.</Text>
        ) : (
          <>
            <Text style={styles.balanceValue}>{formatCurrency(displayedBalance ?? 0)}</Text>
            {fund === "bank" && (
              <Text style={styles.balancePending}>Pending expenses: {formatCurrency(balance?.bankFund.totalPendingExpenses ?? 0)}</Text>
            )}
          </>
        )}
      </View>

      <View style={styles.fundRow}>
        <TouchableOpacity style={[styles.fundButton, fund === "bank" && styles.fundButtonActive]} onPress={() => setFund("bank")}>
          <Text style={[styles.fundButtonText, fund === "bank" && styles.fundButtonTextActive]}>Bank Fund</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fundButton, fund === "cash" && styles.fundButtonActive]} onPress={() => setFund("cash")}>
          <Text style={[styles.fundButtonText, fund === "cash" && styles.fundButtonTextActive]}>Cash Fund</Text>
        </TouchableOpacity>
      </View>

      {fund === "bank" ? <BankFundView /> : <CashFundPanel />}
    </View>
  );
}

function BankFundView() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BankTab>("expenses");
  const [contributionFormVisible, setContributionFormVisible] = useState(false);
  const [expenseFormVisible, setExpenseFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);

  const { data: generalExpenses = [], isError: generalExpensesIsError } = useQuery({
    queryKey: ["expenses", "general"],
    queryFn: () => apiRequest<Expense[]>("/api/expenses?eventId=general"),
    enabled: tab === "expenses",
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", "general"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete expense", error.message),
  });

  const confirmDeleteExpense = (expense: Expense) => {
    Alert.alert("Delete expense", `Remove "${expense.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteExpenseMutation.mutate(expense.id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>General Expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "contributions" && styles.tabButtonActive]} onPress={() => setTab("contributions")}>
          <Text style={[styles.tabButtonText, tab === "contributions" && styles.tabButtonTextActive]}>Contributions</Text>
        </TouchableOpacity>
      </View>

      {tab === "expenses" ? (
        <FlatList
          data={generalExpenses}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => {
                  setEditingExpense(item);
                  setExpenseFormVisible(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.description}</Text>
                  <Text style={styles.cardMeta}>{item.date}</Text>
                </View>
                <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteExpense(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{generalExpensesIsError ? "Could not load expenses." : "No general expenses yet."}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      ) : (
        <RecentContributions
          onEdit={(c) => {
            setEditingContribution(c);
            setContributionFormVisible(true);
          }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (tab === "expenses") {
            setEditingExpense(null);
            setExpenseFormVisible(true);
          } else {
            setEditingContribution(null);
            setContributionFormVisible(true);
          }
        }}
      >
        <Text style={styles.fabText}>{tab === "expenses" ? "+ Add Expense" : "+ Add Contribution"}</Text>
      </TouchableOpacity>

      <ExpenseForm
        visible={expenseFormVisible}
        onClose={() => setExpenseFormVisible(false)}
        eventId={null}
        expense={editingExpense}
        invalidateKey={["expenses", "general"]}
      />
      <ContributionForm
        visible={contributionFormVisible}
        onClose={() => setContributionFormVisible(false)}
        contribution={editingContribution}
      />
    </View>
  );
}

function RecentContributions({ onEdit }: { onEdit: (contribution: Contribution) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: contributions = [], isError: contributionsIsError } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => apiRequest<Contribution[]>("/api/contributions"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/contributions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete contribution", error.message),
  });

  const confirmDelete = (contribution: Contribution) => {
    Alert.alert("Delete contribution", `Remove this contribution of ${formatCurrency(contribution.amount)}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(contribution.id) },
    ]);
  };

  return (
    <FlatList
      data={contributions}
      keyExtractor={(c) => String(c.id)}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardContent} onPress={() => onEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.note || "Contribution"}</Text>
              <Text style={styles.cardMeta}>{item.date}</Text>
            </View>
            <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>{contributionsIsError ? "Could not load contributions." : "No contributions logged yet."}</Text>}
      contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12 },
  balanceLabel: { color: colors.primarySoft, fontSize: 13 },
  balanceValue: { color: colors.white, fontSize: 32, fontWeight: "800", marginTop: 4 },
  balancePending: { color: colors.primarySoft, fontSize: 12, marginTop: 8 },
  fundRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, gap: 8 },
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

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing this file.

- [ ] **Step 3: Manual verification**

With the backend from the paired backend plan running (`npm run dev` in the repo root) and `EXPO_PUBLIC_API_URL` pointed at it, run `cd mobile && npm start` and in Expo Go / a simulator:
- Confirm the Balance screen shows a Bank Fund / Cash Fund switcher.
- Confirm Bank Fund behaves exactly as before (Contributions/General Expenses tabs, add/edit/delete).
- Switch to Cash Fund — confirm it renders `CashFundPanel` (empty state initially).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/BalanceScreen.tsx
git commit -m "feat: add bank/cash fund switcher to balance screen"
```

---

### Task 6: `SettingsScreen` — two opening balances

**Files:**
- Modify: `mobile/src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/settings` new shape `{ bankOpeningBalance, cashOpeningBalance }` (backend plan Task 4).

**⚠️ Conflict note:** same as Task 5 — `mobile/src/screens/SettingsScreen.tsx` had uncommitted changes from a separate session at spec-review time. Check `git status` before starting; this task only replaces the `OpeningBalanceSection` function, so if the other session's changes are elsewhere in the file, resolve by keeping both edits rather than overwriting.

- [ ] **Step 1: Replace `OpeningBalanceSection` with two balance sections**

In `mobile/src/screens/SettingsScreen.tsx`, replace the `OpeningBalanceSection` function with:

```tsx
type SettingsResponse = { bankOpeningBalance: number; cashOpeningBalance: number };

function OpeningBalanceSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: settings, isError: settingsError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest<SettingsResponse>("/api/settings"),
  });
  const [bankValue, setBankValue] = useState<string | null>(null);
  const [cashValue, setCashValue] = useState<string | null>(null);

  const displayedBank = bankValue ?? (settings ? String(settings.bankOpeningBalance) : "");
  const displayedCash = cashValue ?? (settings ? String(settings.cashOpeningBalance) : "");

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<SettingsResponse>) =>
      apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      Alert.alert("Saved", "Opening balance updated.");
    },
    onError: (error: any) => Alert.alert("Could not save", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Opening Balances</Text>
      {settingsError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>Could not load settings.</Text>}

      <Text style={styles.label}>Bank Fund</Text>
      <TextInput style={styles.input} value={displayedBank} onChangeText={setBankValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayedBank);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate({ bankOpeningBalance: parsed });
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save Bank Fund"}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Cash Fund</Text>
      <TextInput style={styles.input} value={displayedCash} onChangeText={setCashValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayedCash);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate({ cashOpeningBalance: parsed });
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save Cash Fund"}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/SettingsScreen.tsx
git commit -m "feat: split opening balance settings into bank and cash"
```

---

### Task 7: `ReportsScreen` — Cash Fund breakdown

**Files:**
- Modify: `mobile/src/screens/ReportsScreen.tsx`

**Interfaces:**
- Consumes: `ReportResponse.cashFund` (Task 1; backend plan Task 6).

- [ ] **Step 1: Add a Cash Fund summary block and entry lists**

In `mobile/src/screens/ReportsScreen.tsx`, right after the existing bank-fund `summaryCard` block (`{report ? (<View style={styles.summaryCard}>...</View>) : null}`), insert a second summary card:

```tsx
      {report ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Cash Fund</Text>
          <Row label="Opening balance" value={formatCurrency(report.cashFund.openingBalance)} />
          <Row label="Offering received" value={formatCurrency(report.cashFund.totalOffering)} />
          <Row label="Donations received" value={formatCurrency(report.cashFund.totalDonation)} />
          <Row label="Expenses" value={formatCurrency(report.cashFund.totalExpenses)} />
          <Row label="Closing balance" value={formatCurrency(report.cashFund.closingBalance)} bold />
        </View>
      ) : null}
```

Then, after the existing "Contributions" list block near the end of the `report ? (...)` section, add:

```tsx
          <Text style={styles.sectionTitle}>Cash Fund Income ({report.cashFund.income.length})</Text>
          {report.cashFund.income.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.cashFund.income.map((i, idx) => (
              <View key={idx} style={styles.listRow}>
                <Text style={styles.listRowTitle}>
                  {i.type === "donation" ? i.donorName || "Donation" : "Offering"}
                </Text>
                <Text style={styles.listRowMeta}>
                  {i.date} · {formatCurrency(i.amount)}
                  {i.note ? ` · ${i.note}` : ""}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Cash Fund Expenses ({report.cashFund.expenses.length})</Text>
          {report.cashFund.expenses.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.cashFund.expenses.map((e, idx) => (
              <View key={idx} style={styles.listRow}>
                <Text style={styles.listRowTitle}>{e.description}</Text>
                <Text style={styles.listRowMeta}>
                  {e.date} · {formatCurrency(e.amount)}
                </Text>
              </View>
            ))
          )}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors anywhere in the mobile app.

- [ ] **Step 3: Manual verification (full golden path)**

With backend and mobile both running:
1. Cash Fund → log an Offering (amount, today's date). Balance switcher shows the Cash Fund balance increase.
2. Cash Fund → log a Donation, typing a few letters of an existing member's name — confirm the suggestion dropdown appears and selecting it fills the field; then start a new donation and type a name with no match — confirm it still saves.
3. Cash Fund → log a meeting expense — confirm the Cash Fund balance decreases.
4. Tap any of the three rows just created — confirm it opens pre-filled for editing; save a change and confirm it persists. Trash-delete one row and confirm the confirm-dialog appears and removal works.
5. Settings → confirm both opening balance fields load and save independently.
6. Reports → pick a range covering today — confirm the Cash Fund summary card and both entry lists show the data above, and "Share / Export PDF" produces a PDF with a Cash Fund section.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/ReportsScreen.tsx
git commit -m "feat: show cash fund breakdown in reports"
```
