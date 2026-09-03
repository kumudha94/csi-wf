import { useState, useMemo, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest } from "../lib/api";
import type { Member, Contribution } from "../lib/types";
import { todayString, dateToString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = { visible: boolean; onClose: () => void; contribution?: Contribution | null };

export default function ContributionForm({ visible, onClose, contribution }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!contribution;
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
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

  const { data: members = [], isError: membersIsError } = useQuery({
    queryKey: ["members", ""],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible,
  });

  useEffect(() => {
    if (visible) {
      setAmount(contribution ? String(contribution.amount) : "");
      setDate(contribution?.date || todayString());
      setNote(contribution?.note || "");
      setSelectedMember(null);
      setMemberQuery("");
      setShowSuggestions(false);
    }
  }, [visible, contribution]);

  useEffect(() => {
    if (visible && contribution) {
      const match = members.find((m) => m.id === contribution.memberId);
      if (match) {
        setSelectedMember(match);
        setMemberQuery(match.name);
      }
    }
  }, [visible, contribution, members]);

  const memberMatches = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return [];
    return members
      .filter((m) => m.name.toLowerCase().includes(query) || m.santhaNumber.toLowerCase().includes(query))
      .slice(0, 6);
  }, [members, memberQuery]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        memberId: selectedMember!.id,
        amount: parseFloat(amount),
        date,
        note: note.trim() || null,
      };
      if (isEditing) {
        return apiRequest(`/api/contributions/${contribution!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/contributions", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
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
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isEditing ? "Edit Contribution" : "Add Contribution"}</Text>

        <Text style={styles.label}>Member *</Text>
        <TextInput
          style={styles.input}
          value={memberQuery}
          onChangeText={(text) => {
            setMemberQuery(text);
            setSelectedMember(null);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Type member name or santha number"
        />
        {membersIsError ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Could not load members.</Text> : null}
        {showSuggestions && !selectedMember && memberQuery.trim().length > 0 && (
          <View style={styles.suggestionsBox}>
            {memberMatches.length === 0 ? (
              <Text style={styles.suggestionEmpty}>No matching members.</Text>
            ) : (
              memberMatches.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setSelectedMember(m);
                    setMemberQuery(m.name);
                    setShowSuggestions(false);
                  }}
                >
                  <Text style={{ color: colors.textPrimary }}>{m.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.santhaNumber}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={{ color: colors.textPrimary }}>{date}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={new Date(`${date}T00:00:00`)} mode="date" display="default" onChange={handleDateChange} />
        )}

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
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary, justifyContent: "center" },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: colors.surface,
  },
  suggestionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionEmpty: { padding: 12, color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
