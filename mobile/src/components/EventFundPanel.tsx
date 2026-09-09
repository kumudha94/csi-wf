import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { apiRequest } from "../lib/api";
import type { Expense, EventDetail } from "../lib/types";
import { formatCurrency, formatDisplayDate, todayString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import ExpenseForm from "./ExpenseForm";
import EventIncomeForm from "./EventIncomeForm";
import EventFundActionModal from "./EventFundActionModal";

type Props = { eventId: number; event: EventDetail };
type FundTab = "income" | "expenses";

// The hasEventFund=true half of EventDetailScreen: gradient hero showing
// collected/spent/remaining, plus Offering/Donation and Expenses tabs --
// mirrors CashFundPanel's shape, scoped to one event's own fund.
export default function EventFundPanel({ eventId, event }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FundTab>("income");
  const [formVisible, setFormVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Expense | null>(null);
  const [fundActionVisible, setFundActionVisible] = useState(false);

  const { data: allEntries = [], isFetching, isError } = useQuery({
    queryKey: ["expenses", "event", eventId],
    queryFn: () => apiRequest<Expense[]>(`/api/expenses?eventId=${eventId}`),
  });

  const debitRows = useMemo(() => allEntries.filter((e) => e.txnType === "debit"), [allEntries]);
  const creditRows = useMemo(() => allEntries.filter((e) => e.txnType === "credit"), [allEntries]);
  const list = tab === "income" ? creditRows : debitRows;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete", error.message),
  });

  const confirmDelete = (entry: Expense) => {
    Alert.alert("Delete", `Remove "${entry.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(entry.id) },
    ]);
  };

  const remaining = event.eventFundRemaining;
  const eventDatePassed = !!event.eventDate && event.eventDate <= todayString();
  const settled = !!event.fundTransferredTo;
  const showFundAction = eventDatePassed && !settled && remaining !== 0;

  const badgeLabel = (status: Expense["status"]) => {
    if (tab !== "income") return status;
    return status === "paid" ? "received" : "pending";
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={colors.eventGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        {showFundAction && (
          <TouchableOpacity style={styles.fundActionIcon} onPress={() => setFundActionVisible(true)}>
            <Ionicons name={remaining > 0 ? "swap-horizontal-outline" : "alert-circle-outline"} size={22} color={colors.white} />
          </TouchableOpacity>
        )}
        <Text style={styles.heroLabel}>Event Fund</Text>
        <Text style={[styles.heroValue, remaining < 0 && styles.heroValueNegative]}>{formatCurrency(remaining)}</Text>
        <Text style={styles.heroSubtext}>Collected: {formatCurrency(event.eventFundCollected)}</Text>
        <Text style={styles.heroSubtext}>Spent: {formatCurrency(event.totalPaid)}</Text>
        {settled && (
          <Text style={styles.heroSettled}>
            Transferred to {event.fundTransferredTo === "bank" ? "BankFund" : "CashFund"}
            {event.fundTransferredAt ? ` on ${formatDisplayDate(event.fundTransferredAt.slice(0, 10))}` : ""}
          </Text>
        )}
      </LinearGradient>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "income" && styles.tabButtonActive]} onPress={() => setTab("income")}>
          <Text style={[styles.tabButtonText, tab === "income" && styles.tabButtonTextActive]}>Offering / Donation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>Expenses</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={list}
        keyExtractor={(e) => String(e.id)}
        refreshing={isFetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] })}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardContent}
              onPress={() => {
                setEditingEntry(item);
                setFormVisible(true);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDescription}>{item.description}</Text>
                <Text style={styles.expenseMeta}>
                  {formatDisplayDate(item.date)}
                  {tab === "income" && item.donorName ? ` · ${item.donorName}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
                <Text style={[styles.badge, item.status === "paid" ? styles.badgePaid : styles.badgePending]}>
                  {badgeLabel(item.status)}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isError ? "Could not load entries." : tab === "income" ? "No offering or donation entries yet." : "No expenses yet for this event."}
          </Text>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingEntry(null);
          setFormVisible(true);
        }}
      >
        <Text style={styles.fabText}>{tab === "income" ? "+ Add Offering / Donation" : "+ Add Expense"}</Text>
      </TouchableOpacity>

      {tab === "income" ? (
        <EventIncomeForm
          visible={formVisible}
          onClose={() => setFormVisible(false)}
          eventId={eventId}
          entry={editingEntry}
          invalidateKey={["expenses", "event", eventId]}
        />
      ) : (
        <ExpenseForm
          visible={formVisible}
          onClose={() => setFormVisible(false)}
          eventId={eventId}
          expense={editingEntry}
          invalidateKey={["expenses", "event", eventId]}
          lockedFundSource="eventFund"
        />
      )}

      <EventFundActionModal
        visible={fundActionVisible}
        onClose={() => setFundActionVisible(false)}
        eventId={eventId}
        mode={remaining > 0 ? "surplus" : "shortfall"}
        amount={Math.abs(remaining)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  heroCard: { margin: 16, marginBottom: 0, padding: 20, borderRadius: 12, position: "relative" },
  fundActionIcon: { position: "absolute", top: 16, right: 16, zIndex: 1 },
  heroLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValue: { color: colors.white, fontSize: 28, fontWeight: "800", marginTop: 4 },
  heroValueNegative: { color: "#FFD1C7" },
  heroSubtext: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 4 },
  heroSettled: { color: colors.white, fontSize: 12, fontWeight: "600", marginTop: 10 },
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
    alignItems: "center",
  },
  cardContent: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deleteButton: { paddingLeft: 12, marginLeft: 8 },
  expenseDescription: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  expenseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  badge: { fontSize: 11, fontWeight: "700", marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  badgePaid: { backgroundColor: colors.successSoft, color: colors.success },
  badgePending: { backgroundColor: colors.warningSoft, color: colors.warning },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  fabText: { color: colors.white, fontWeight: "700" },
});
