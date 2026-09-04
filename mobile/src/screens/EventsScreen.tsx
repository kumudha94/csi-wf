import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import type { EventSummary } from "../lib/types";
import { formatCurrency } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import type { EventsStackParamList } from "../navigation/types";
import EventForm from "../components/EventForm";

type Props = NativeStackScreenProps<EventsStackParamList, "EventsList">;

export default function EventsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [createVisible, setCreateVisible] = useState(false);

  const { data: events = [], isFetching, isError } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<EventSummary[]>("/api/events"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/events/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["expenses", "general"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error: any) => Alert.alert("Could not delete event", error.message),
  });

  const confirmDelete = (event: EventSummary) => {
    Alert.alert("Delete event", `Remove "${event.name}"? Its expenses are kept and moved to General Expenses.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(event.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(e) => String(e.id)}
        refreshing={isFetching}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["events"] })}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardContent} onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}>
              <Text style={styles.eventName}>{item.name}</Text>
              {item.eventDate ? <Text style={styles.eventMeta}>{item.eventDate}</Text> : null}
              <Text style={styles.eventTotal}>Spent: {formatCurrency(item.totalPaid)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>{isError ? "Could not load events." : "No events yet. Tap \"+ New Event\" to create one."}</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
        <Text style={styles.fabText}>+ New Event</Text>
      </TouchableOpacity>
      <EventForm visible={createVisible} onClose={() => setCreateVisible(false)} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
    },
    cardContent: { flex: 1 },
    deleteButton: { paddingLeft: 12, marginLeft: 8 },
    eventName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    eventMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    eventTotal: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
    fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    fabText: { color: colors.white, fontWeight: "700" },
  });
