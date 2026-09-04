import { useState, useMemo, useRef } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { MemberCollectionStatus } from "../lib/types";
import { formatCurrency, lastSundayOrToday } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void };

// Full-screen picker: search + the whole member list, with room to breathe
// since it isn't squeezed under a gradient card/tabs like the main
// Contributions tab is. Already-paid members show a "Paid" badge only --
// editing an existing payment happens from the main tab's paid list, not
// here (this screen's job is collecting new/pending payments).
export default function AddContributionModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const listRef = useRef<FlatList>(null);

  const { data: status = [], isError } = useQuery({
    queryKey: ["contributionCollectionStatus"],
    queryFn: () => apiRequest<MemberCollectionStatus[]>("/api/contributions/collection-status"),
    enabled: visible,
  });

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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Contribution</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              onFocus={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              placeholder="Search member name or santha number"
            />
            {search.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {isError ? <Text style={styles.errorText}>Could not load contribution status.</Text> : null}

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          data={filtered}
          keyExtractor={(m) => String(m.memberId)}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{item.name}</Text>
                <Text style={styles.memberMeta}>
                  {item.santhaNumber}
                  {item.paidThisMonth ? ` • Paid ${formatCurrency(item.currentMonthAmount ?? 0)}` : ""}
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
                    onFocus={() => listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true })}
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
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8 },
  searchInputWrap: { flex: 1, justifyContent: "center" },
  clearButton: { position: "absolute", right: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    paddingRight: 32,
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
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
