import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Member } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  candidates: Member[];
  initialSelectedIds: number[];
  onDone: (ids: number[]) => void;
  onClose: () => void;
};

export default function MemberPickerModal({ visible, candidates, initialSelectedIds, onDone, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible) {
      setSelected(new Set(initialSelectedIds));
      setSearch("");
    }
  }, [visible, initialSelectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (m) => m.name.toLowerCase().includes(q) || m.santhaNumber.toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Members</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or santha number"
          placeholderTextColor={colors.textMuted}
        />

        <View style={styles.toolbarRow}>
          <Text style={styles.countText}>{selected.size} selected</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <TouchableOpacity onPress={selectAllVisible}>
              <Text style={styles.toolbarAction}>Select all</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAll}>
              <Text style={styles.toolbarAction}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => {
            const checked = selected.has(item.id);
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item.id)}>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{[item.name, item.lastName].filter(Boolean).join(" ")}</Text>
                  <Text style={styles.rowMeta}>Santha No: {item.santhaNumber}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No members match.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />

        <TouchableOpacity style={styles.doneButton} onPress={() => onDone(Array.from(selected))}>
          <Text style={styles.doneButtonText}>Done ({selected.size})</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    searchInput: {
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
    },
    toolbarRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    countText: { color: colors.textSecondary, fontSize: 13 },
    toolbarAction: { color: colors.primary, fontWeight: "600", fontSize: 13 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
    doneButton: {
      margin: 16,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    doneButtonText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  });
