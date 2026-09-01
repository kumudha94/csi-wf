import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, Expense } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import ContributionForm from "../components/ContributionForm";
import ExpenseForm from "../components/ExpenseForm";

type Tab = "contributions" | "expenses";

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>("expenses");
  const [contributionFormVisible, setContributionFormVisible] = useState(false);
  const [expenseFormVisible, setExpenseFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });

  const { data: generalExpenses = [], isError: generalExpensesIsError } = useQuery({
    queryKey: ["expenses", "general"],
    queryFn: () => apiRequest<Expense[]>("/api/expenses?eventId=general"),
    enabled: tab === "expenses",
  });

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        {balanceIsError ? (
          <Text style={styles.balanceValue}>Could not load balance.</Text>
        ) : (
          <>
            <Text style={styles.balanceValue}>{formatCurrency(balance?.balance ?? 0)}</Text>
            <Text style={styles.balancePending}>Pending expenses: {formatCurrency(balance?.totalPendingExpenses ?? 0)}</Text>
          </>
        )}
      </View>

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
            <TouchableOpacity
              style={styles.card}
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
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{generalExpensesIsError ? "Could not load expenses." : "No general expenses yet."}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      ) : (
        <RecentContributions />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (tab === "expenses") {
            setEditingExpense(null);
            setExpenseFormVisible(true);
          } else {
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
      <ContributionForm visible={contributionFormVisible} onClose={() => setContributionFormVisible(false)} />
    </View>
  );
}

function RecentContributions() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: contributions = [], isError: contributionsIsError } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => apiRequest<{ id: number; memberId: number; amount: number; date: string; note: string | null }[]>(
      "/api/contributions"
    ),
  });

  return (
    <FlatList
      data={contributions}
      keyExtractor={(c) => String(c.id)}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.note || "Contribution"}</Text>
            <Text style={styles.cardMeta}>{item.date}</Text>
          </View>
          <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
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
  tabRow: { flexDirection: "row", margin: 16, gap: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabButtonText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  tabButtonTextActive: { color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardAmount: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  fabText: { color: colors.white, fontWeight: "700" },
});
