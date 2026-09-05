import { useState, useMemo, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, LayoutAnimation } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, CashFundIncome, CashFundExpense } from "../lib/types";
import { formatCurrency, formatDisplayDate, isCurrentMonth } from "../lib/format";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import CashIncomeForm from "./CashIncomeForm";
import CashExpenseForm from "./CashExpenseForm";
import ReportModal from "./ReportModal";
import TransactionSearchBar from "./TransactionSearchBar";
import DateRangeFilterModal from "./DateRangeFilterModal";

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
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [incomeSearch, setIncomeSearch] = useState("");
  const [incomeDateFilter, setIncomeDateFilter] = useState<{ from: string; to: string } | null>(null);
  const [incomeFilterModalVisible, setIncomeFilterModalVisible] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseDateFilter, setExpenseDateFilter] = useState<{ from: string; to: string } | null>(null);
  const [expenseFilterModalVisible, setExpenseFilterModalVisible] = useState(false);
  const isKeyboardVisible = useKeyboardVisible();

  // While actively searching (keyboard up + something typed), collapse the
  // balance card so the keyboard doesn't eat most of the results list.
  // Restored as soon as the keyboard closes or the search text is cleared.
  const activeSearchText = tab === "income" ? incomeSearch : expenseSearch;
  const hideBalanceCard = isKeyboardVisible && activeSearchText.trim().length > 0;
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hideBalanceCard]);

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });
  const cashFund = balance?.cashFund;

  const { data: allIncome = [], isError: incomeIsError } = useQuery({
    queryKey: ["cashFundIncome"],
    queryFn: () => apiRequest<CashFundIncome[]>("/api/cash-fund-income"),
    enabled: tab === "income",
  });
  const income = useMemo(() => {
    let list = allIncome;
    if (incomeDateFilter) {
      list = list.filter((i) => i.date >= incomeDateFilter.from && i.date <= incomeDateFilter.to);
    } else if (!incomeSearch.trim()) {
      list = list.filter((i) => isCurrentMonth(i.date));
    }
    const query = incomeSearch.trim().toLowerCase();
    if (query) {
      list = list.filter((i) => {
        const title = i.note || (i.type === "donation" ? i.donorName || "Donation" : "Offering");
        return title.toLowerCase().includes(query);
      });
    }
    return list;
  }, [allIncome, incomeDateFilter, incomeSearch]);

  const { data: allExpenses = [], isError: expensesIsError } = useQuery({
    queryKey: ["cashFundExpenses"],
    queryFn: () => apiRequest<CashFundExpense[]>("/api/cash-fund-expenses"),
    enabled: tab === "expenses",
  });
  const expenses = useMemo(() => {
    let list = allExpenses;
    if (expenseDateFilter) {
      list = list.filter((e) => e.date >= expenseDateFilter.from && e.date <= expenseDateFilter.to);
    } else if (!expenseSearch.trim()) {
      list = list.filter((e) => isCurrentMonth(e.date));
    }
    const query = expenseSearch.trim().toLowerCase();
    if (query) {
      list = list.filter((e) => e.description.toLowerCase().includes(query));
    }
    return list;
  }, [allExpenses, expenseDateFilter, expenseSearch]);

  const deleteIncomeMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cash-fund-income/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashFundIncome"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete entry", error.message),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cash-fund-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashFundExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      {!hideBalanceCard && (
        <View style={styles.balanceCard}>
          <TouchableOpacity style={styles.reportIconButton} onPress={() => setReportModalVisible(true)}>
            <Ionicons name="document-text-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.balanceLabel}>Cash Balance</Text>
          {balanceIsError ? (
            <Text style={styles.balanceValue}>Could not load balance.</Text>
          ) : (
            <>
              <Text style={styles.balanceValue}>{formatCurrency(cashFund?.balance ?? 0)}</Text>
              <Text style={styles.balanceSubtext}>Offering: {formatCurrency(cashFund?.totalOffering ?? 0)}</Text>
              <Text style={styles.balanceSubtext}>Donation: {formatCurrency(cashFund?.totalDonation ?? 0)}</Text>
            </>
          )}
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "income" && styles.tabButtonActive]} onPress={() => setTab("income")}>
          <Text style={[styles.tabButtonText, tab === "income" && styles.tabButtonTextActive]}>Offering / Donation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>Expenses</Text>
        </TouchableOpacity>
      </View>

      {tab === "income" ? (
        <>
          <TransactionSearchBar
            value={incomeSearch}
            onChangeText={setIncomeSearch}
            onOpenAdvanced={() => setIncomeFilterModalVisible(true)}
            hasActiveFilter={!!incomeDateFilter}
            placeholder="Search by reason"
          />
          <FlatList
            style={{ flex: 1 }}
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
                    <Text style={styles.cardTitle}>
                      {item.note || (item.type === "donation" ? item.donorName || "Donation" : "Offering")}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {item.type === "donation" ? "Donation" : "Offering"}
                      {item.type === "donation" && item.donorName && item.note ? ` - ${item.donorName}` : ""}
                      {" · "}
                      {formatDisplayDate(item.date)}
                    </Text>
                  </View>
                  <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteIncome(item)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {incomeIsError
                  ? "Could not load entries."
                  : incomeSearch.trim() || incomeDateFilter
                  ? "No matching entries."
                  : "No offering or donation entries this month."}
              </Text>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          />
        </>
      ) : (
        <>
          <TransactionSearchBar
            value={expenseSearch}
            onChangeText={setExpenseSearch}
            onOpenAdvanced={() => setExpenseFilterModalVisible(true)}
            hasActiveFilter={!!expenseDateFilter}
            placeholder="Search expenses by reason"
          />
          <FlatList
            style={{ flex: 1 }}
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
                    <Text style={styles.cardMeta}>{formatDisplayDate(item.date)}</Text>
                  </View>
                  <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteExpense(item)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {expensesIsError
                  ? "Could not load expenses."
                  : expenseSearch.trim() || expenseDateFilter
                  ? "No matching expenses."
                  : "No expenses this month."}
              </Text>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          />
        </>
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
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        pdfPath="/api/reports/cash-fund/pdf"
        fileNamePrefix="csi-wf-cash-fund-report"
      />
      <DateRangeFilterModal
        visible={incomeFilterModalVisible}
        onClose={() => setIncomeFilterModalVisible(false)}
        initialFrom={incomeDateFilter?.from ?? null}
        initialTo={incomeDateFilter?.to ?? null}
        onApply={(from, to) => setIncomeDateFilter({ from, to })}
        onClear={() => setIncomeDateFilter(null)}
      />
      <DateRangeFilterModal
        visible={expenseFilterModalVisible}
        onClose={() => setExpenseFilterModalVisible(false)}
        initialFrom={expenseDateFilter?.from ?? null}
        initialTo={expenseDateFilter?.to ?? null}
        onApply={(from, to) => setExpenseDateFilter({ from, to })}
        onClear={() => setExpenseDateFilter(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12, position: "relative" },
  reportIconButton: { position: "absolute", top: 16, right: 16, zIndex: 1 },
  balanceLabel: { color: colors.primarySoft, fontSize: 13 },
  balanceValue: { color: colors.white, fontSize: 28, fontWeight: "800", marginTop: 4 },
  balanceSubtext: { color: colors.primarySoft, fontSize: 12, marginTop: 4 },
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
