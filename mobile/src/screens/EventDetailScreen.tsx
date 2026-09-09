import { useState, useMemo, useLayoutEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { apiRequest, API_BASE_URL } from "../lib/api";
import { getToken } from "../lib/authStorage";
import type { Expense, EventDetail } from "../lib/types";
import { formatCurrency, formatDisplayDate } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import ExpenseForm from "../components/ExpenseForm";
import EventFundPanel from "../components/EventFundPanel";
import EventForm from "../components/EventForm";
import type { EventsStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

export default function EventDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { eventId } = route.params;
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [eventFormVisible, setEventFormVisible] = useState(false);

  const { data: event, isError: eventIsError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiRequest<EventDetail>(`/api/events/${eventId}`),
  });

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const token = await getToken();
      const safeName = (event?.name || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const fileUri = `${cacheDirectory}csi-wf-${safeName}.pdf`;
      const result = await downloadAsync(`${API_BASE_URL}/api/events/${eventId}/pdf`, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("Saved", `Report saved to ${result.uri}`);
      }
    } catch (error: any) {
      Alert.alert("Export failed", error.message || "Could not generate the PDF");
    } finally {
      setIsExporting(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => setEventFormVisible(true)} disabled={!event} style={{ marginRight: 16, opacity: event ? 1 : 0.4 }}>
            <Ionicons name="pencil-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExportPdf} disabled={isExporting} style={{ marginRight: 12, opacity: isExporting ? 0.4 : 1 }}>
            <Ionicons name="download-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, isExporting, event, eventId, colors]);

  const { data: expenses = [], isFetching, isError: expensesIsError } = useQuery({
    queryKey: ["expenses", "event", eventId],
    queryFn: () => apiRequest<Expense[]>(`/api/expenses?eventId=${eventId}`),
    enabled: event ? !event.hasEventFund : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
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
      {eventIsError && <Text style={styles.emptyText}>Could not load event details.</Text>}

      {event?.hasEventFund ? (
        <EventFundPanel eventId={eventId} event={event} />
      ) : (
        !eventIsError && (
          <>
            <View style={styles.summaryCard}>
              {event?.eventDate ? <Text style={styles.eventMeta}>{event.eventDate}</Text> : null}
              {event?.details ? <Text style={styles.eventDetails}>{event.details}</Text> : null}
              <Text style={styles.summaryLine}>Paid: {formatCurrency(totalPaid)}</Text>
              <Text style={styles.summaryLineMuted}>Pending: {formatCurrency(totalPending)}</Text>
            </View>

            <FlatList
              data={expenses}
              keyExtractor={(e) => String(e.id)}
              refreshing={isFetching}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] })}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardContent}
                    onPress={() => {
                      setEditingExpense(item);
                      setFormVisible(true);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expenseDescription}>{item.description}</Text>
                      <Text style={styles.expenseMeta}>
                        {formatDisplayDate(item.date)} · {item.fundSource === "bank" ? "BankFund" : "CashFund"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
                      <Text style={[styles.badge, item.status === "paid" ? styles.badgePaid : styles.badgePending]}>
                        {item.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{expensesIsError ? "Could not load expenses." : "No expenses yet for this event."}</Text>}
              contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
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
          </>
        )
      )}

      <EventForm visible={eventFormVisible} onClose={() => setEventFormVisible(false)} event={event} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: { backgroundColor: colors.surface, margin: 16, marginBottom: 0, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  eventMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
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
