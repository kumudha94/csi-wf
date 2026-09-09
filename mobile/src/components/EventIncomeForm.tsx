import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest, uploadReceipt } from "../lib/api";
import type { Expense, ExpenseStatus } from "../lib/types";
import { todayString, dateToString, formatDisplayDate } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: number;
  entry?: Expense | null;
  invalidateKey: unknown[];
};

// Credit-side counterpart to ExpenseForm -- an event's own Offering/Donation
// entry, written to the same `expenses` table with txnType "credit" and
// fundSource forced to "eventFund" (never user-chosen).
export default function EventIncomeForm({ visible, onClose, eventId, entry, invalidateKey }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!entry;

  const [donorName, setDonorName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState<ExpenseStatus>("paid");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setDonorName(entry?.donorName || "");
      setDescription(entry?.description || "");
      setAmount(entry ? String(entry.amount) : "");
      setDate(entry?.date || todayString());
      setStatus(entry?.status || "paid");
      setReceiptUri(null);
      setReceiptUrl(entry?.receiptPhotoUrl || null);
    }
  }, [visible, entry]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setDate(dateToString(selectedDate));
    }
  };

  const removeReceipt = () => {
    setReceiptUri(null);
    setReceiptUrl(null);
  };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setReceiptUri(result.assets[0].uri);
    setIsUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUrl(url);
    } catch (error: any) {
      Alert.alert("Upload failed", error.message || "Could not upload the receipt photo");
      setReceiptUri(null);
    } finally {
      setIsUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        eventId,
        description: description.trim(),
        amount: parseFloat(amount),
        receiptPhotoUrl: receiptUrl,
        status,
        fundSource: "eventFund" as const,
        txnType: "credit" as const,
        donorName: donorName.trim() || null,
        date,
      };
      if (isEditing) {
        return apiRequest(`/api/expenses/${entry!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save entry", error.message || "Something went wrong"),
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Missing reason", "Enter what this offering or donation was for.");
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

        <Text style={styles.label}>Donor name (optional)</Text>
        <TextInput style={styles.input} value={donorName} onChangeText={setDonorName} placeholder="Type a name, or leave blank" />

        <Text style={styles.label}>Reason / Description *</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="What was this for?" />

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={{ color: colors.textPrimary }}>{formatDisplayDate(date)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
        )}

        <Text style={styles.label}>Status</Text>
        <View style={styles.statusRow}>
          {(["pending", "paid"] as ExpenseStatus[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.statusOption, status === s && styles.statusOptionActive]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusOptionText, status === s && styles.statusOptionTextActive]}>
                {s === "paid" ? "Received" : "Pending"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Receipt photo</Text>
        {receiptUri || receiptUrl ? (
          <View style={styles.receiptPreviewRow}>
            <Image source={{ uri: receiptUri || receiptUrl! }} style={styles.receiptPreview} />
            <TouchableOpacity style={styles.removeReceiptButton} onPress={removeReceipt} disabled={isUploading}>
              <Text style={styles.removeReceiptButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity style={styles.photoButton} onPress={pickReceipt} disabled={isUploading}>
          <Text style={styles.photoButtonText}>{isUploading ? "Uploading..." : "Choose Photo"}</Text>
        </TouchableOpacity>

        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending || isUploading}>
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
  statusRow: { flexDirection: "row", gap: 10 },
  statusOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  statusOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusOptionText: { color: colors.textSecondary, fontWeight: "600" },
  statusOptionTextActive: { color: colors.primary },
  receiptPreviewRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 10 },
  receiptPreview: { width: 120, height: 120, borderRadius: 8 },
  removeReceiptButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  removeReceiptButtonText: { color: colors.danger, fontWeight: "600" },
  photoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  photoButtonText: { color: colors.textSecondary, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
