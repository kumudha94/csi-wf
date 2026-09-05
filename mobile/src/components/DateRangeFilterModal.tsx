import { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { dateToString, formatDisplayDate, isValidDateString, todayString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialFrom: string | null;
  initialTo: string | null;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
};

// Small overlay (not a full-screen modal like ReportModal) for narrowing a
// transaction list to an explicit date range -- this is the "advanced
// search" opened from TransactionSearchBar's options icon.
export default function DateRangeFilterModal({ visible, onClose, initialFrom, initialTo, onApply, onClear }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || todayString());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setFrom(initialFrom || "");
      setTo(initialTo || todayString());
    }
  }, [visible, initialFrom, initialTo]);

  const handleFromChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowFromPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) setFrom(dateToString(selectedDate));
  };

  const handleToChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowToPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) setTo(dateToString(selectedDate));
  };

  const rangeValid = isValidDateString(from) && isValidDateString(to) && from <= to;

  const handleApply = () => {
    if (!rangeValid) return;
    onApply(from, to);
    onClose();
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter by date</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>From</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowFromPicker(true)}>
              <Text style={{ color: from ? colors.textPrimary : colors.textMuted }}>
                {from ? formatDisplayDate(from) : "Select date"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calendarButton} onPress={() => setShowFromPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {showFromPicker && (
            <DateTimePicker
              value={from ? new Date(`${from}T00:00:00`) : new Date()}
              mode="date"
              display="default"
              onChange={handleFromChange}
            />
          )}

          <Text style={styles.label}>To</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowToPicker(true)}>
              <Text style={{ color: to ? colors.textPrimary : colors.textMuted }}>
                {to ? formatDisplayDate(to) : "Select date"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calendarButton} onPress={() => setShowToPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {showToPicker && (
            <DateTimePicker
              value={to ? new Date(`${to}T00:00:00`) : new Date()}
              mode="date"
              display="default"
              onChange={handleToChange}
            />
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleClear}>
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, !rangeValid && styles.buttonDisabled]} onPress={handleApply} disabled={!rangeValid}>
              <Text style={styles.buttonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    title: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
    label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      backgroundColor: colors.background,
      color: colors.textPrimary,
      justifyContent: "center",
    },
    dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    calendarButton: {
      width: 44,
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    row: { flexDirection: "row", gap: 12, marginTop: 24 },
    button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
    secondaryButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  });
