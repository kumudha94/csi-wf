import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition, AttributeType } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { useTheme, type ThemeMode } from "../contexts/ThemeContext";

function AppearanceSection() {
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const options: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.typeRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.typeOption, mode === opt.value && styles.typeOptionActive]}
            onPress={() => setMode(opt.value)}
          >
            <Text style={[styles.typeOptionText, mode === opt.value && styles.typeOptionTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function OpeningBalanceSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: settings, isError: settingsError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest<{ openingBalance: number }>("/api/settings"),
  });
  const [value, setValue] = useState<string | null>(null);

  const displayValue = value ?? (settings ? String(settings.openingBalance) : "");

  const saveMutation = useMutation({
    mutationFn: (openingBalance: number) => apiRequest("/api/settings", { method: "PUT", body: JSON.stringify({ openingBalance }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      Alert.alert("Saved", "Opening balance updated.");
    },
    onError: (error: any) => Alert.alert("Could not save", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Opening Balance</Text>
      {settingsError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>Could not load settings.</Text>}
      <TextInput style={styles.input} value={displayValue} onChangeText={setValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayValue);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate(parsed);
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomAttributesSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: attributes = [], isError: attributesError } = useQuery({
    queryKey: ["attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/attributes"),
  });
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AttributeType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");

  const addOption = () => {
    const trimmed = optionDraft.trim();
    if (!trimmed || options.includes(trimmed)) {
      setOptionDraft("");
      return;
    }
    setOptions((prev) => [...prev, trimmed]);
    setOptionDraft("");
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/attributes", {
        method: "POST",
        body: JSON.stringify({ key: key.trim(), label: label.trim(), type, options: type === "list" ? options : undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attributes"] });
      setKey("");
      setLabel("");
      setType("text");
      setOptions([]);
      setOptionDraft("");
    },
    onError: (error: any) => Alert.alert("Could not add attribute", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/attributes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attributes"] }),
    onError: (error: any) => Alert.alert("Could not remove attribute", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Custom Member Fields</Text>
      {attributesError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>Could not load fields.</Text>}
      <FlatList
        data={attributes}
        keyExtractor={(a) => String(a.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.attributeRow}>
            <Text style={{ color: colors.textPrimary }}>
              {item.label}{" "}
              <Text style={{ color: colors.textMuted }}>
                ({item.type === "list" && item.options?.length ? `list: ${item.options.join(", ")}` : item.type})
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Remove field", `Remove "${item.label}"? Existing member values for it are kept but hidden.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
                ])
              }
            >
              <Text style={{ color: colors.danger, fontWeight: "600" }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Text style={styles.label}>Field label (e.g. "Blood Group")</Text>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Field label" />
      <Text style={styles.label}>Field key (lowercase, no spaces, e.g. "blood_group")</Text>
      <TextInput style={styles.input} value={key} onChangeText={setKey} placeholder="field_key" autoCapitalize="none" />
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

      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          if (!label.trim() || !key.trim()) {
            Alert.alert("Missing details", "Enter both a field label and a key.");
            return;
          }
          if (type === "list" && options.length === 0) {
            Alert.alert("Missing options", "Add at least one option for a list field.");
            return;
          }
          createMutation.mutate();
        }}
        disabled={createMutation.isPending}
      >
        <Text style={styles.buttonText}>{createMutation.isPending ? "Adding..." : "Add Field"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ChangePinSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const changeMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/pin", { method: "PATCH", body: JSON.stringify({ currentPin, newPin }) }),
    onSuccess: async () => {
      Alert.alert("PIN changed", "Unlock the app again with your new PIN.", [{ text: "OK", onPress: () => logout() }]);
    },
    onError: (error: any) => Alert.alert("Could not change PIN", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Change PIN</Text>
      <Text style={styles.label}>Current PIN</Text>
      <TextInput style={styles.input} value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" />
      <Text style={styles.label}>New PIN (4+ digits)</Text>
      <TextInput style={styles.input} value={newPin} onChangeText={setNewPin} secureTextEntry keyboardType="number-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          if (newPin.length < 4) {
            Alert.alert("PIN too short", "Choose a PIN with at least 4 digits.");
            return;
          }
          changeMutation.mutate();
        }}
        disabled={changeMutation.isPending}
      >
        <Text style={styles.buttonText}>{changeMutation.isPending ? "Changing..." : "Change PIN"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <AppearanceSection />
      <OpeningBalanceSection />
      <CustomAttributesSection />
      <ChangePinSection />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.background, color: colors.textPrimary },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  buttonText: { color: colors.white, fontWeight: "600" },
  attributeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeOption: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  typeOptionTextActive: { color: colors.primary },
  optionInputRow: { flexDirection: "row", gap: 8 },
  addOptionButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  optionChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  optionChip: { backgroundColor: colors.primarySoft, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  optionChipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
});
