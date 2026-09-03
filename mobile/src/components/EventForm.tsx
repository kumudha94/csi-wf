import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { EventSummary } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  event?: { id: number; name: string; details: string | null } | null;
};

export default function EventForm({ visible, onClose, event }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const isEditing = !!event;
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (visible) {
      setName(event?.name || "");
      setDetails(event?.details || "");
    }
  }, [visible, event]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), details: details.trim() || null };
      if (isEditing) {
        return apiRequest(`/api/events/${event!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/events", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (isEditing) queryClient.invalidateQueries({ queryKey: ["event", event!.id] });
      setName("");
      setDetails("");
      onClose();
    },
    onError: (error: any) => Alert.alert(isEditing ? "Could not update event" : "Could not create event", error.message),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Text style={styles.title}>{isEditing ? "Edit Event" : "New Event"}</Text>
        <Text style={styles.label}>Event name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Annual Meet" />
        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={details}
          onChangeText={setDetails}
          placeholder="Details"
          multiline
          numberOfLines={3}
        />
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            disabled={saveMutation.isPending}
            onPress={() => {
              if (!name.trim()) {
                Alert.alert("Missing name", "Enter an event name.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : isEditing ? "Save" : "Create"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 20 },
    title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary },
    textArea: { minHeight: 70, textAlignVertical: "top" },
    row: { flexDirection: "row", gap: 12, marginTop: 28 },
    button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
    buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
    secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
