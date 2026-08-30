import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import type { Expense, EventDetail } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { colors } from "../theme";
import ExpenseForm from "../components/ExpenseForm";
import type { EventsStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

export default function EventDetailScreen({ route }: Props) {
  const { eventId } = route.params;
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const { data: event, isError: eventIsError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiRequest<EventDetail>(`/api/events/${eventId}`),
  });

  const { data: expenses = [], isLoading, isError: expensesIsError } = useQuery({
    queryKey: ["expenses", "event", eventId],
    queryFn: () => apiRequest<Expense[]>(`/api/expenses?eventId=${eventId}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error: any) => Alert.alert("Could not delete expense", error.message),
  });

  const totalPaid = expenses.filter((e) => e.status === "paid").reduce((sum, e) => sum + e.amount, 0);
  const totalPending = expenses.filter((e) => e.status === "pending").reduce((sum, e) => sum + e.amount, 0);

  const confirmDelete = (expense: Expense) => {
    Alert.alert("Delete expense", `Remove "${expense.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(expense.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      {eventIsError ? <Text style={styles.emptyText}>Could not load event details.</Text> : (
        <View style={styles.summaryCard}>
          {event?.details ? <Text style={styles.eventDetails}>{event.details}</Text> : null}
          <Text style={styles.summaryLine}>Paid: {formatCurrency(totalPaid)}</Text>
          <Text style={styles.summaryLineMuted}>Pending: {formatCurrency(totalPending)}</Text>
        </View>
      )}

      <FlatList
        data={expenses}
        keyExtractor={(e) => String(e.id)}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] })}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setEditingExpense(item);
              setFormVisible(true);
            }}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.expenseDescription}>{item.description}</Text>
              <Text style={styles.expenseMeta}>{item.date}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
              <Text style={[styles.badge, item.status === "paid" ? styles.badgePaid : styles.badgePending]}>
                {item.status}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{expensesIsError ? "Could not load expenses." : "No expenses yet for this event."}</Text>}
        contentContainerStyle={{ padding: 16 }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingExpense(null);
          setFormVisible(true);
        }}
      >
        <Text style={styles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>

      <ExpenseForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        eventId={eventId}
        expense={editingExpense}
        invalidateKey={["expenses", "event", eventId]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: { backgroundColor: colors.surface, margin: 16, marginBottom: 0, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  eventDetails: { color: colors.textSecondary, marginBottom: 8 },
  summaryLine: { fontSize: 15, fontWeight: "700", color: colors.success },
  summaryLineMuted: { fontSize: 13, color: colors.warning, marginTop: 2 },
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
