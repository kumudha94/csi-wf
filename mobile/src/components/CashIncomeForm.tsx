import { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { Member, CashFundIncome, CashIncomeType } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; income?: CashFundIncome | null };

const TYPE_OPTIONS: { value: CashIncomeType; label: string }[] = [
  { value: "offering", label: "Offering" },
  { value: "donation", label: "Donation" },
];

export default function CashIncomeForm({ visible, onClose, income }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!income;

  const [type, setType] = useState<CashIncomeType>("offering");
  const [donorName, setDonorName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const { data: members = [] } = useQuery({
    queryKey: ["members", ""],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible && type === "donation",
  });

  useEffect(() => {
    if (visible) {
      setType(income?.type || "offering");
      setDonorName(income?.donorName || "");
      setAmount(income ? String(income.amount) : "");
      setDate(income?.date || todayString());
      setNote(income?.note || "");
      setShowSuggestions(false);
    }
  }, [visible, income]);

  const memberMatches = useMemo(() => {
    const query = donorName.trim().toLowerCase();
    if (!query) return [];
    return members.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 6);
  }, [members, donorName]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        type,
        amount: parseFloat(amount),
        date,
        donorName: type === "donation" ? donorName.trim() || null : null,
        note: note.trim() || null,
      };
      if (isEditing) {
        return apiRequest(`/api/cash-fund-income/${income!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/cash-fund-income", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cashFundIncome"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save entry", error.message),
  });

  const handleSubmit = () => {
    if (type === "offering" && !note.trim()) {
      Alert.alert("Missing reason", "Enter what this offering was for.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.title}>{isEditing ? "Edit Entry" : "Add Offering / Donation"}</Text>

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.typeOption, type === opt.value && styles.typeOptionActive]}
                onPress={() => setType(opt.value)}
              >
                <Text style={[styles.typeOptionText, type === opt.value && styles.typeOptionTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {type === "donation" && (
            <>
              <Text style={styles.label}>Donor name (optional)</Text>
              <TextInput
                style={styles.input}
                value={donorName}
                onChangeText={(text) => {
                  setDonorName(text);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Type a name, or leave blank"
              />
              {showSuggestions && donorName.trim().length > 0 && memberMatches.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {memberMatches.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.suggestionRow}
                      onPress={() => {
                        setDonorName(m.name);
                        setShowSuggestions(false);
                      }}
                    >
                      <Text style={{ color: colors.textPrimary }}>{m.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.santhaNumber}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowDatePicker(true)}>
              <Text style={{ color: colors.textPrimary }}>{date}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calendarButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
          )}

          <Text style={styles.label}>{type === "offering" ? "Reason / Description *" : "Note"}</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder={type === "offering" ? "What was this offering for?" : "Optional note"}
          />

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
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary, justifyContent: "center" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeOption: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surface },
  typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionText: { color: colors.textSecondary, fontWeight: "600" },
  typeOptionTextActive: { color: colors.primary },
  suggestionsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 4, backgroundColor: colors.surface },
  suggestionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  calendarButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
