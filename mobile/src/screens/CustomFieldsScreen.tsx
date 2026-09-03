import { useState, useMemo } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import AttributeForm from "../components/AttributeForm";

export default function CustomFieldsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDefinition | null>(null);

  const { data: attributes = [], isError: attributesError } = useQuery({
    queryKey: ["attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/attributes"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/attributes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attributes"] }),
    onError: (error: any) => Alert.alert("Could not remove field", error.message),
  });

  const confirmDelete = (attribute: AttributeDefinition) => {
    Alert.alert("Delete field", `Remove "${attribute.label}"? Existing member values for it are kept but hidden.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(attribute.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={attributes}
        keyExtractor={(a) => String(a.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cardContent}
              onPress={() => {
                setEditingAttribute(item);
                setFormVisible(true);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardMeta}>
                  {item.type === "list" && item.options?.length ? `list: ${item.options.join(", ")}` : item.type}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{attributesError ? "Could not load fields." : "No custom member fields yet."}</Text>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingAttribute(null);
          setFormVisible(true);
        }}
      >
        <Text style={styles.fabText}>+ Add Field</Text>
      </TouchableOpacity>

      <AttributeForm visible={formVisible} onClose={() => setFormVisible(false)} attribute={editingAttribute} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
    cardTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
    cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
