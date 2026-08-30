import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Modal } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import type { EventSummary } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { colors } from "../theme";
import type { EventsStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<EventsStackParamList, "EventsList">;

function CreateEventModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/api/events", { method: "POST", body: JSON.stringify({ name: name.trim(), details: details.trim() || null }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setName("");
      setDetails("");
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not create event", error.message),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.title}>New Event</Text>
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
            disabled={createMutation.isPending}
            onPress={() => {
              if (!name.trim()) {
                Alert.alert("Missing name", "Enter an event name.");
                return;
              }
              createMutation.mutate();
            }}
          >
            <Text style={styles.buttonText}>{createMutation.isPending ? "Creating..." : "Create"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function EventsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [createVisible, setCreateVisible] = useState(false);

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<EventSummary[]>("/api/events"),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(e) => String(e.id)}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["events"] })}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}>
            <Text style={styles.eventName}>{item.name}</Text>
            <Text style={styles.eventTotal}>Spent: {formatCurrency(item.totalPaid)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{isError ? "Could not load events." : "No events yet. Tap \"+ New Event\" to create one."}</Text>}
        contentContainerStyle={{ padding: 16 }}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
        <Text style={styles.fabText}>+ New Event</Text>
      </TouchableOpacity>
      <CreateEventModal visible={createVisible} onClose={() => setCreateVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  eventTotal: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  fabText: { color: colors.white, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 20 },
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
