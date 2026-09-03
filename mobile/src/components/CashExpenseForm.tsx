import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { CashFundExpense } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; expense?: CashFundExpense | null };

export default function CashExpenseForm({ visible, onClose, expense }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!expense;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setDescription(expense?.description || "");
      setAmount(expense ? String(expense.amount) : "");
      setDate(expense?.date || todayString());
    }
  }, [visible, expense]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { description: description.trim(), amount: parseFloat(amount), date };
      if (isEditing) {
        return apiRequest(`/api/cash-fund-expenses/${expense!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/cash-fund-expenses", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["cashFundExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save expense", error.message),
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Missing description", "Enter what this expense was for.");
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
          <Text style={styles.title}>{isEditing ? "Edit Expense" : "Add Meeting Expense"}</Text>

          <Text style={styles.label}>Reason / Description *</Text>
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Tea, snacks, auto fare..." />

          <Text style={styles.label}>Amount (₹) *</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{date}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
