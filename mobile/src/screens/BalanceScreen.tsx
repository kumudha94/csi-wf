import { useState, useMemo, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, LayoutAnimation } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, BankTransaction } from "../lib/types";
import { formatCurrency, formatDisplayDate, isCurrentMonth } from "../lib/format";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import BankTransactionForm from "../components/BankTransactionForm";
import ContributionCollectForm from "../components/ContributionCollectForm";
import ReportModal from "../components/ReportModal";
import TransactionSearchBar from "../components/TransactionSearchBar";
import DateRangeFilterModal from "../components/DateRangeFilterModal";

type BankTab = "transfers" | "contributions";

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BankTab>("transfers");
  const [transactionFormVisible, setTransactionFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BankTransaction | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferDateFilter, setTransferDateFilter] = useState<{ from: string; to: string } | null>(null);
  const [transferFilterModalVisible, setTransferFilterModalVisible] = useState(false);
  const [contributionSearchActive, setContributionSearchActive] = useState(false);
  const isKeyboardVisible = useKeyboardVisible();

  // Same collapse-on-search behavior as CashFundPanel. The Contributions
  // tab lives in its own component, so it reports "is there active search
  // text" back up via onSearchActiveChange rather than this screen reading
  // its state directly.
  const isSearchActive = tab === "transfers" ? transferSearch.trim().length > 0 : contributionSearchActive;
  const hideBalanceCard = isKeyboardVisible && isSearchActive;
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hideBalanceCard]);

  const { data: balance, isError: balanceIsError } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });
  const bankFund = balance?.bankFund;

  const { data: allTransactions = [], isError: transactionsIsError } = useQuery({
    queryKey: ["bankTransactions"],
    queryFn: () => apiRequest<BankTransaction[]>("/api/bank-transactions"),
    enabled: tab === "transfers",
  });
  const transactions = useMemo(() => {
    let list = allTransactions;
    if (transferDateFilter) {
      list = list.filter((t) => t.date >= transferDateFilter.from && t.date <= transferDateFilter.to);
    } else if (!transferSearch.trim()) {
      list = list.filter((t) => isCurrentMonth(t.date));
    }
    const query = transferSearch.trim().toLowerCase();
    if (query) {
      list = list.filter((t) => t.description.toLowerCase().includes(query));
    }
    return list;
  }, [allTransactions, transferDateFilter, transferSearch]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/bank-transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      {!hideBalanceCard && (
        <View style={styles.balanceCard}>
          <TouchableOpacity style={styles.reportIconButton} onPress={() => setReportModalVisible(true)}>
            <Ionicons name="document-text-outline" size={22} color={colors.white} />
          </TouchableOpacity>
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
      )}

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
          <TransactionSearchBar
            value={transferSearch}
            onChangeText={setTransferSearch}
            onOpenAdvanced={() => setTransferFilterModalVisible(true)}
            hasActiveFilter={!!transferDateFilter}
            placeholder="Search transfers by reason"
          />
          <FlatList
            style={{ flex: 1 }}
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
                    <Text style={styles.cardMeta}>{formatDisplayDate(item.date)}</Text>
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
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {transactionsIsError
                  ? "Could not load transfers."
                  : transferSearch.trim() || transferDateFilter
                  ? "No matching transfers."
                  : "No transfers this month."}
              </Text>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          />
        </>
      ) : (
        <ContributionCollectForm onSearchActiveChange={setContributionSearchActive} />
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
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        pdfPath="/api/reports/bank-fund/pdf"
        fileNamePrefix="csi-wf-bank-fund-report"
      />
      <DateRangeFilterModal
        visible={transferFilterModalVisible}
        onClose={() => setTransferFilterModalVisible(false)}
        initialFrom={transferDateFilter?.from ?? null}
        initialTo={transferDateFilter?.to ?? null}
        onApply={(from, to) => setTransferDateFilter({ from, to })}
        onClear={() => setTransferDateFilter(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12, position: "relative" },
  reportIconButton: { position: "absolute", top: 16, right: 16, zIndex: 1 },
  balanceRow: { marginBottom: 4 },
  balanceLabel: { color: colors.primarySoft, fontSize: 13 },
  balanceValue: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 2 },
  depositStatus: { color: colors.primarySoft, fontSize: 12, marginTop: 12, fontWeight: "600" },
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
