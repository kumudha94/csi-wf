import { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { Member, MemberWithAttributes, MemberStatus } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { useMemberSortPreference } from "../hooks/useMemberSortPreference";
import type { SettingsStackParamList } from "../navigation/types";
import MemberForm from "../components/MemberForm";
import MemberSettingsModal from "../components/MemberSettingsModal";

const STATUS_FILTERS: { value: MemberStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "died", label: "Died" },
];

type Props = NativeStackScreenProps<SettingsStackParamList, "Members">;

export default function MembersScreen({ route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemberStatus | "all">(route.params?.initialStatus ?? "all");
  const [formVisible, setFormVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberWithAttributes | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { preference: sortPreference, setPreference: setSortPreference } = useMemberSortPreference();

  // Dashboard's status tiles pass a fresh initialStatus each time they
  // navigate here (even if the screen is already mounted in this stack) --
  // pick it up without requiring the user to have come from a cold start.
  useEffect(() => {
    if (route.params?.initialStatus) setStatusFilter(route.params.initialStatus);
  }, [route.params?.initialStatus]);

  const { data: allMembers = [], isFetching } = useQuery({
    queryKey: ["members", search, sortPreference.field, sortPreference.dir],
    queryFn: () =>
      apiRequest<Member[]>(
        `/api/members?${new URLSearchParams({
          ...(search ? { search } : {}),
          sortBy: sortPreference.field,
          sortDir: sortPreference.dir,
        }).toString()}`
      ),
  });

  // The list endpoint has no status filter server-side (only /export does),
  // and member counts here are small enough that filtering client-side
  // after fetch is simplest.
  const members = useMemo(
    () => (statusFilter === "all" ? allMembers : allMembers.filter((m) => m.status === statusFilter)),
    [allMembers, statusFilter]
  );

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/members/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error: any) => Alert.alert("Could not delete member", error.message),
  });

  const openEdit = async (member: Member) => {
    try {
      const full = await apiRequest<MemberWithAttributes>(`/api/members/${member.id}`);
      setEditingMember(full);
      setFormVisible(true);
    } catch (error: any) {
      Alert.alert("Could not load member", error.message || "Something went wrong");
    }
  };

  const confirmDelete = (member: Member) => {
    Alert.alert("Delete member", `Remove ${member.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(member.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or santha number"
          />
          {search.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={() => setSettingsVisible(true)}>
          <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingMember(null);
            setFormVisible(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusFilterRow}>
        {STATUS_FILTERS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.statusChip, statusFilter === opt.value && styles.statusChipActive]}
            onPress={() => setStatusFilter(opt.value)}
          >
            <Text style={[styles.statusChipText, statusFilter === opt.value && styles.statusChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => String(m.id)}
        refreshing={isFetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["members"] })}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardContent} onPress={() => openEdit(item)}>
              <Text style={styles.memberName}>{[item.name, item.lastName].filter(Boolean).join(" ")}</Text>
              <Text style={styles.memberMeta}>Santha No: {item.santhaNumber}</Text>
              {item.phone ? <Text style={styles.memberMeta}>{item.phone}</Text> : null}
              {item.defaultAmount > 0 ? (
                <Text style={styles.memberMeta}>Default: {formatCurrency(item.defaultAmount)}</Text>
              ) : null}
              {item.status !== "active" ? (
                <Text style={[styles.memberMeta, styles.statusBadge]}>{item.status === "died" ? "Died" : "Inactive"}</Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {statusFilter === "all" ? 'No members yet. Tap "+ Add" to create one.' : `No ${statusFilter} members.`}
          </Text>
        }
        contentContainerStyle={{ padding: 16 }}
      />

      <MemberForm visible={formVisible} onClose={() => setFormVisible(false)} member={editingMember} />
      <MemberSettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        sortPreference={sortPreference}
        onSaveSort={setSortPreference}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  searchInputWrap: { flex: 1, justifyContent: "center" },
  clearButton: { position: "absolute", right: 10 },
  iconButton: {
    width: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    paddingRight: 32,
    backgroundColor: colors.surface,
  },
  addButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: colors.white, fontWeight: "600" },
  statusFilterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  statusChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  statusChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusChipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  statusChipTextActive: { color: colors.primary },
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
  cardContent: { flex: 1 },
  deleteButton: { paddingLeft: 12, marginLeft: 8 },
  memberName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  memberMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { color: colors.danger, fontWeight: "600" },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
