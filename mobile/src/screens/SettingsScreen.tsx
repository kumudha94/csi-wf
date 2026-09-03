import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import type { ThemeColors } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { useTheme, type ThemeMode } from "../contexts/ThemeContext";
import type { SettingsStackParamList } from "../navigation/types";

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

type SettingsResponse = { bankOpeningBalance: number; cashOpeningBalance: number };

function OpeningBalanceSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: settings, isError: settingsError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest<SettingsResponse>("/api/settings"),
  });
  const [bankValue, setBankValue] = useState<string | null>(null);
  const [cashValue, setCashValue] = useState<string | null>(null);

  const displayedBank = bankValue ?? (settings ? String(settings.bankOpeningBalance) : "");
  const displayedCash = cashValue ?? (settings ? String(settings.cashOpeningBalance) : "");

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<SettingsResponse>) =>
      apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      if (variables.bankOpeningBalance !== undefined) setBankValue(null);
      if (variables.cashOpeningBalance !== undefined) setCashValue(null);
      Alert.alert("Saved", "Opening balance updated.");
    },
    onError: (error: any) => Alert.alert("Could not save", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Opening Balances</Text>
      {settingsError && <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>Could not load settings.</Text>}

      <Text style={styles.label}>Bank Fund</Text>
      <TextInput style={styles.input} value={displayedBank} onChangeText={setBankValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayedBank);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate({ bankOpeningBalance: parsed });
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save Bank Fund"}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Cash Fund</Text>
      <TextInput style={styles.input} value={displayedCash} onChangeText={setCashValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayedCash);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate({ cashOpeningBalance: parsed });
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save Cash Fund"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomFieldsLink({ navigation }: { navigation: SettingsScreenProps["navigation"] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={[styles.section, styles.linkRow]} onPress={() => navigation.navigate("CustomFields")}>
      <Text style={styles.sectionTitle}>Custom Member Fields</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
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

type SettingsScreenProps = NativeStackScreenProps<SettingsStackParamList, "SettingsHome">;

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <AppearanceSection />
      <OpeningBalanceSection />
      <CustomFieldsLink navigation={navigation} />
      <ChangePinSection />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.background, color: colors.textPrimary },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  buttonText: { color: colors.white, fontWeight: "600" },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeOption: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  typeOptionTextActive: { color: colors.primary },
});
