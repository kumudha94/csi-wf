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
