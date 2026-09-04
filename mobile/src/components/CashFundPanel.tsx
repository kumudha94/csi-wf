import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, CashFundIncome, CashFundExpense } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import CashIncomeForm from "./CashIncomeForm";
import CashExpenseForm from "./CashExpenseForm";
import ReportModal from "./ReportModal";

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

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });
  const cashFund = balance?.cashFund;

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
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
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

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "income" && styles.tabButtonActive]} onPress={() => setTab("income")}>
          <Text style={[styles.tabButtonText, tab === "income" && styles.tabButtonTextActive]}>Offering / Donation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>Expenses</Text>
        </TouchableOpacity>
      </View>

      {tab === "income" ? (
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
                  <Text style={styles.cardMeta}>{item.date}</Text>
                </View>
                <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeleteExpense(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{expensesIsError ? "Could not load expenses." : "No expenses yet."}</Text>}
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
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        pdfPath="/api/reports/cash-fund/pdf"
        fileNamePrefix="csi-wf-cash-fund-report"
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
