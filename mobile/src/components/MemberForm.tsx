import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition, MemberWithAttributes } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  member?: MemberWithAttributes | null;
};

export default function MemberForm({ visible, onClose, member }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!member;

  const { data: attributeDefs = [] } = useQuery({
    queryKey: ["attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/attributes"),
  });

  const [name, setName] = useState("");
  const [santhaNumber, setSanthaNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [age, setAge] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setName(member?.name || "");
      setSanthaNumber(member?.santhaNumber || "");
      setPhone(member?.phone || "");
      setAddress(member?.address || "");
      setAge(member?.age ? String(member.age) : "");
      const values: Record<string, string> = {};
      for (const attr of member?.attributes || []) {
        values[attr.attributeKey] = attr.value || "";
      }
      setCustomValues(values);
    }
  }, [visible, member]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        santhaNumber: santhaNumber.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        age: age ? Number(age) : null,
      };
      const saved = isEditing
        ? await apiRequest<{ id: number }>(`/api/members/${member!.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ id: number }>("/api/members", { method: "POST", body: JSON.stringify(payload) });

      for (const attr of attributeDefs) {
        const value = customValues[attr.key];
        if (value !== undefined) {
          await apiRequest(`/api/members/${saved.id}/attributes/${attr.key}`, {
            method: "PUT",
            body: JSON.stringify({ value }),
          });
        }
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      onClose();
    },
    onError: (error: any) => {
      Alert.alert("Could not save member", error.message || "Something went wrong");
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !santhaNumber.trim()) {
      Alert.alert("Missing details", "Name and santha number are required.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isEditing ? "Edit Member" : "Add Member"}</Text>

        <Text style={styles.label}>Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" />

        <Text style={styles.label}>Santha Number *</Text>
        <TextInput style={styles.input} value={santhaNumber} onChangeText={setSanthaNumber} placeholder="e.g. SW-101" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={address}
          onChangeText={setAddress}
          placeholder="Address"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Age</Text>
        <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Age" keyboardType="number-pad" />

        {attributeDefs.map((attr) => (
          <View key={attr.key}>
            <Text style={styles.label}>{attr.label}</Text>
            {attr.type === "list" ? (
              <View style={styles.optionRow}>
                {(attr.options || []).map((opt) => {
                  const selected = customValues[attr.key] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.optionChip, selected && styles.optionChipActive]}
                      onPress={() => setCustomValues((prev) => ({ ...prev, [attr.key]: selected ? "" : opt }))}
                    >
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={customValues[attr.key] || ""}
                onChangeText={(text) => setCustomValues((prev) => ({ ...prev, [attr.key]: text }))}
                placeholder={attr.label}
                keyboardType={attr.type === "number" ? "number-pad" : "default"}
              />
            )}
          </View>
        ))}

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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.surface },
  optionChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  optionChipTextActive: { color: colors.primary },
});
