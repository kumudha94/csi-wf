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

      {fund === "bank" ? <BankFundView balance={balance} balanceIsError={balanceIsError} /> : <CashFundPanel />}
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
        {balanceIsError ? (
          <Text style={styles.balanceValue}>Could not load balance.</Text>
        ) : (
          <>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Bank Balance</Text>
              <Text style={styles.balanceValue}>{formatCurrency(bankFund?.balance ?? 0)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance in Hand</Text>
              <Text style={styles.balanceValue}>{formatCurrency(bankFund?.balanceInHand ?? 0)}</Text>
            </View>
            <Text style={styles.depositStatus}>
              {bankFund?.depositStatus.monthLabel} deposit{" "}
              {bankFund?.depositStatus.completed ? "completed" : "pending"}
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
                <Text style={styles.cardAmount}>
                  {item.type === "deposit" ? "+" : "-"}
                  {formatCurrency(item.amount)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{transactionsIsError ? "Could not load transfers." : "No transfers logged yet."}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      ) : (
        <ContributionCollectForm />
      )}

      {tab === "transfers" && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            setEditingTransaction(null);
            setTransactionFormVisible(true);
          }}
        >
          <Text style={styles.fabText}>+ Add Transfer</Text>
        </TouchableOpacity>
      )}

      <BankTransactionForm
        visible={transactionFormVisible}
        onClose={() => setTransactionFormVisible(false)}
        transaction={editingTransaction}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12 },
  balanceRow: { marginBottom: 4 },
  balanceLabel: { color: colors.primarySoft, fontSize: 13 },
  balanceValue: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 2 },
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
