import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { MemberCollectionStatus } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import ContributionEditModal from "./ContributionEditModal";
import AddContributionModal from "./AddContributionModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Mirrors the Transfers tab's shape: a plain list of what's already
// recorded (tap to edit, trash to delete, FAB to add) -- picking WHO to
// add a payment for happens in AddContributionModal, its own full screen.
export default function ContributionCollectForm() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [editingMember, setEditingMember] = useState<MemberCollectionStatus | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const { data: status = [], isError } = useQuery({
    queryKey: ["contributionCollectionStatus"],
    queryFn: () => apiRequest<MemberCollectionStatus[]>("/api/contributions/collection-status"),
  });

  const paid = useMemo(() => status.filter((s) => s.paidThisMonth), [status]);

  const summary = useMemo(() => {
    let pendingAmount = 0;
    let pendingCount = 0;
    let collectedAmount = 0;
    for (const s of status) {
      if (s.paidThisMonth) {
        collectedAmount += s.currentMonthAmount ?? 0;
      } else {
        pendingAmount += s.defaultAmount * s.missingMonths.length;
        pendingCount += 1;
      }
    }
    return { collectedAmount, collectedCount: paid.length, pendingAmount, pendingCount };
  }, [status, paid.length]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/contributions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributionCollectionStatus"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete contribution", error.message),
  });

  const confirmDelete = (member: MemberCollectionStatus) => {
    Alert.alert("Delete contribution", `Remove ${member.name}'s payment of ${formatCurrency(member.currentMonthAmount ?? 0)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (member.currentMonthContributionId) deleteMutation.mutate(member.currentMonthContributionId);
        },
      },
    ]);
  };

  const monthLabel = MONTH_NAMES[new Date().getMonth()];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{monthLabel} Contributions</Text>
        <Text style={styles.summaryText}>
          Collected: {formatCurrency(summary.collectedAmount)} ({summary.collectedCount})
        </Text>
        <Text style={styles.summaryText}>
          Pending: {formatCurrency(summary.pendingAmount)} ({summary.pendingCount})
        </Text>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={paid}
        keyExtractor={(m) => String(m.memberId)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardContent} onPress={() => setEditingMember(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {item.santhaNumber} · {item.currentMonthDate}
                </Text>
              </View>
              <Text style={styles.cardAmount}>{formatCurrency(item.currentMonthAmount ?? 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{isError ? "Could not load contributions." : "No contributions logged yet this month."}</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)}>
        <Text style={styles.fabText}>+ Add Contribution</Text>
      </TouchableOpacity>

      <ContributionEditModal visible={!!editingMember} onClose={() => setEditingMember(null)} member={editingMember} />
      <AddContributionModal visible={addModalVisible} onClose={() => setAddModalVisible(false)} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  summaryCard: { backgroundColor: colors.primarySoft, margin: 16, marginBottom: 8, padding: 16, borderRadius: 10 },
  summaryTitle: { fontWeight: "700", color: colors.textPrimary },
  summaryText: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
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
