import { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { MemberCollectionStatus } from "../lib/types";
import { formatCurrency, todayString, dateToString, lastSundayOrToday } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ContributionCollectForm() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [editingMember, setEditingMember] = useState<MemberCollectionStatus | null>(null);

  const { data: status = [], isError } = useQuery({
    queryKey: ["contributionCollectionStatus"],
    queryFn: () => apiRequest<MemberCollectionStatus[]>("/api/contributions/collection-status"),
  });

  const summary = useMemo(() => {
    let collectedAmount = 0;
    let collectedCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    for (const s of status) {
      if (s.paidThisMonth) {
        collectedAmount += s.currentMonthAmount ?? 0;
        collectedCount += 1;
      } else {
        pendingAmount += s.defaultAmount * s.missingMonths.length;
        pendingCount += 1;
      }
    }
    return { collectedAmount, collectedCount, pendingAmount, pendingCount };
  }, [status]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return status;
    return status.filter(
      (m) => m.name.toLowerCase().includes(query) || m.santhaNumber.toLowerCase().includes(query)
    );
  }, [status, search]);

  const collectMutation = useMutation({
    mutationFn: ({ memberId, totalAmount }: { memberId: number; totalAmount: number }) =>
      apiRequest("/api/contributions/collect", {
        method: "POST",
        body: JSON.stringify({ memberId, totalAmount, date: lastSundayOrToday() }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contributionCollectionStatus"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setAmounts((prev) => {
        const next = { ...prev };
        delete next[variables.memberId];
        return next;
      });
    },
    onError: (error: any) => Alert.alert("Could not record payment", error.message || "Something went wrong"),
  });

  const handleAdd = (member: MemberCollectionStatus) => {
    const displayed = amounts[member.memberId] ?? String(member.defaultAmount * member.missingMonths.length);
    const parsed = parseFloat(displayed);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    collectMutation.mutate({ memberId: member.memberId, totalAmount: parsed });
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

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search member name or santha number"
      />
      {isError ? <Text style={styles.errorText}>Could not load contribution status.</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(m) => String(m.memberId)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            disabled={!item.paidThisMonth}
            onPress={() => item.paidThisMonth && setEditingMember(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberMeta}>
                {item.santhaNumber}
                {item.paidThisMonth
                  ? ` • Paid ${formatCurrency(item.currentMonthAmount ?? 0)} on ${item.currentMonthDate}`
                  : ""}
              </Text>
              {!item.paidThisMonth && item.missingMonths.length > 1 && (
                <Text style={styles.gapText}>{item.missingMonths.length} months pending</Text>
              )}
            </View>
            {item.paidThisMonth ? (
              <View style={[styles.actionButton, styles.actionButtonPaid]}>
                <Text style={styles.actionButtonText}>Paid</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.amountInput}
                  value={amounts[item.memberId] ?? String(item.defaultAmount * item.missingMonths.length)}
                  onChangeText={(text) => setAmounts((prev) => ({ ...prev, [item.memberId]: text }))}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAdd(item)}
                  disabled={collectMutation.isPending}
                >
                  <Text style={styles.actionButtonText}>Add</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
      />

      <ContributionEditModal visible={!!editingMember} onClose={() => setEditingMember(null)} member={editingMember} />
    </View>
  );
}

function ContributionEditModal({
  visible,
  onClose,
  member,
}: {
  visible: boolean;
  onClose: () => void;
  member: MemberCollectionStatus | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible && member) {
      setAmount(String(member.currentMonthAmount ?? 0));
      setDate(member.currentMonthDate || todayString());
    }
  }, [visible, member]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { amount: parseFloat(amount), date };
      return apiRequest(`/api/contributions/${member!.currentMonthContributionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contributionCollectionStatus"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not update contribution", error.message || "Something went wrong"),
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  if (!member) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.title}>Edit Contribution — {member.name}</Text>

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.editInput} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.editInput} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{date}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.actionButton, { flex: 1 }, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { flex: 1 }]}
              onPress={handleSubmit}
              disabled={saveMutation.isPending}
            >
              <Text style={styles.actionButtonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  summaryCard: { backgroundColor: colors.primarySoft, margin: 16, marginBottom: 8, padding: 16, borderRadius: 10 },
  summaryTitle: { fontWeight: "700", color: colors.textPrimary },
  summaryText: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  errorText: { color: colors.danger, fontSize: 12, marginHorizontal: 16, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  memberMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  gapText: { fontSize: 11, color: colors.danger, marginTop: 4 },
  amountInput: {
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    textAlign: "right",
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  actionButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
  actionButtonPaid: { backgroundColor: colors.success },
  actionButtonText: { color: colors.white, fontWeight: "700" },
  secondaryButton: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
