import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Image } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { apiRequest, uploadReceipt } from "../lib/api";
import type { Expense, ExpenseStatus } from "../lib/types";
import { todayString } from "../lib/format";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: number | null;
  expense?: Expense | null;
  invalidateKey: unknown[];
};

export default function ExpenseForm({ visible, onClose, eventId, expense, invalidateKey }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!expense;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState<ExpenseStatus>("pending");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setDescription(expense?.description || "");
      setAmount(expense ? String(expense.amount) : "");
      setDate(expense?.date || todayString());
      setStatus(expense?.status || "pending");
      setReceiptUri(null);
      setReceiptUrl(expense?.receiptPhotoUrl || null);
    }
  }, [visible, expense]);

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
        date,
      };
      if (isEditing) {
        return apiRequest(`/api/expenses/${expense!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save expense", error.message || "Something went wrong"),
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
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isEditing ? "Edit Expense" : "Add Expense"}</Text>

        <Text style={styles.label}>Reason / Description *</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="What was this for?" />

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-08-29" />

        <Text style={styles.label}>Status</Text>
        <View style={styles.statusRow}>
          {(["pending", "paid"] as ExpenseStatus[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.statusOption, status === s && styles.statusOptionActive]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusOptionText, status === s && styles.statusOptionTextActive]}>
                {s === "paid" ? "Paid" : "Pending"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Receipt photo</Text>
        {receiptUri || receiptUrl ? (
          <Image source={{ uri: receiptUri || receiptUrl! }} style={styles.receiptPreview} />
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  receiptPreview: { width: 120, height: 120, borderRadius: 8, marginBottom: 10 },
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
