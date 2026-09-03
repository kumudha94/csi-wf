import { useState, useMemo } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { Member, MemberWithAttributes } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import MemberForm from "../components/MemberForm";

export default function MembersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberWithAttributes | null>(null);

  const { data: members = [], isFetching } = useQuery({
    queryKey: ["members", search],
    queryFn: () => apiRequest<Member[]>(`/api/members${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

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
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or santha number"
        />
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

      <FlatList
        data={members}
        keyExtractor={(m) => String(m.id)}
        refreshing={isFetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["members"] })}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardContent} onPress={() => openEdit(item)}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberMeta}>Santha No: {item.santhaNumber}</Text>
              {item.phone ? <Text style={styles.memberMeta}>{item.phone}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No members yet. Tap "+ Add" to create one.</Text>}
        contentContainerStyle={{ padding: 16 }}
      />

      <MemberForm visible={formVisible} onClose={() => setFormVisible(false)} member={editingMember} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.surface,
  },
  addButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: colors.white, fontWeight: "600" },
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
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
