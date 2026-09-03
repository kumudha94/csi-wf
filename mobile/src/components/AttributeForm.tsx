import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition, AttributeType } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  attribute?: AttributeDefinition | null;
};

export default function AttributeForm({ visible, onClose, attribute }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!attribute;

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AttributeType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");

  useEffect(() => {
    if (visible) {
      setKey(attribute?.key || "");
      setLabel(attribute?.label || "");
      setType(attribute?.type || "text");
      setOptions(attribute?.options || []);
      setOptionDraft("");
    }
  }, [visible, attribute]);

  const addOption = () => {
    const trimmed = optionDraft.trim();
    if (!trimmed || options.includes(trimmed)) {
      setOptionDraft("");
      return;
    }
    setOptions((prev) => [...prev, trimmed]);
    setOptionDraft("");
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isEditing) {
        return apiRequest(`/api/attributes/${attribute!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: label.trim(), type, options: type === "list" ? options : undefined }),
        });
      }
      return apiRequest("/api/attributes", {
        method: "POST",
        body: JSON.stringify({ key: key.trim(), label: label.trim(), type, options: type === "list" ? options : undefined }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attributes"] });
      onClose();
    },
    onError: (error: any) => Alert.alert(isEditing ? "Could not update field" : "Could not add field", error.message),
  });

  const handleSubmit = () => {
    if (!label.trim() || (!isEditing && !key.trim())) {
      Alert.alert("Missing details", "Enter both a field label and a key.");
      return;
    }
    if (type === "list" && options.length === 0) {
      Alert.alert("Missing options", "Add at least one option for a list field.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.title}>{isEditing ? "Edit Field" : "Add Field"}</Text>

          <Text style={styles.label}>Field label (e.g. "Blood Group")</Text>
          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Field label" />

          <Text style={styles.label}>Field key (lowercase, no spaces, e.g. "blood_group")</Text>
          {isEditing ? (
            <View style={[styles.input, styles.inputDisabled]}>
              <Text style={{ color: colors.textMuted }}>{key}</Text>
            </View>
          ) : (
            <TextInput style={styles.input} value={key} onChangeText={setKey} placeholder="field_key" autoCapitalize="none" />
          )}

          <View style={styles.typeRow}>
            {(["text", "number", "date", "list"] as AttributeType[]).map((t) => (
              <TouchableOpacity key={t} style={[styles.typeOption, type === t && styles.typeOptionActive]} onPress={() => setType(t)}>
                <Text style={[styles.typeOptionText, type === t && styles.typeOptionTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {type === "list" && (
            <>
              <Text style={styles.label}>List options</Text>
              <View style={styles.optionInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={optionDraft}
                  onChangeText={setOptionDraft}
                  placeholder="e.g. A+"
                  onSubmitEditing={addOption}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.addOptionButton} onPress={addOption}>
                  <Text style={styles.buttonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.optionChipRow}>
                {options.map((opt) => (
                  <TouchableOpacity key={opt} style={styles.optionChip} onPress={() => setOptions((prev) => prev.filter((o) => o !== opt))}>
                    <Text style={styles.optionChipText}>{opt} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
              <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      justifyContent: "center",
    },
    inputDisabled: { backgroundColor: colors.background },
    typeRow: { flexDirection: "row", gap: 8, marginTop: 20 },
    typeOption: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    typeOptionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
    typeOptionTextActive: { color: colors.primary },
    optionInputRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    addOptionButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
    optionChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    optionChip: { backgroundColor: colors.primarySoft, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
    optionChipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
    row: { flexDirection: "row", gap: 12, marginTop: 28 },
    button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
    buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
    secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
