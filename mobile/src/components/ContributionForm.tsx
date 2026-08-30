import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, FlatList } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { Member } from "../lib/types";
import { todayString } from "../lib/format";
import { colors } from "../theme";

type Props = { visible: boolean; onClose: () => void };

export default function ContributionForm({ visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");

  const { data: members = [], isError: membersIsError } = useQuery({
    queryKey: ["members", ""],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/contributions", {
        method: "POST",
        body: JSON.stringify({
          memberId: selectedMember!.id,
          amount: parseFloat(amount),
          date,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setSelectedMember(null);
      setAmount("");
      setNote("");
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save contribution", error.message),
  });

  const handleSubmit = () => {
    if (!selectedMember) {
      Alert.alert("Select a member", "Choose who this contribution is from.");
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
        <Text style={styles.title}>Add Contribution</Text>

        <Text style={styles.label}>Member *</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerOpen(true)}>
          <Text style={{ color: selectedMember ? colors.textPrimary : colors.textMuted }}>
            {selectedMember ? selectedMember.name : "Select a member"}
          </Text>
        </TouchableOpacity>
        {membersIsError ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Could not load members.</Text> : null}

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-08-29" />

        <Text style={styles.label}>Note</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Optional note" />

        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
            <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
          <Text style={styles.title}>Select Member</Text>
          <FlatList
            data={members}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.memberRow}
                onPress={() => {
                  setSelectedMember(item);
                  setPickerOpen(false);
                }}
              >
                <Text style={{ color: colors.textPrimary }}>{item.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.santhaNumber}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary, justifyContent: "center" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  memberRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});
