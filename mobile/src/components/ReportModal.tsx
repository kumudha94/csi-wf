import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_BASE_URL } from "../lib/api";
import { getToken } from "../lib/authStorage";
import { dateToString, isValidDateString } from "../lib/format";
import { DURATION_OPTIONS, getDurationRange, type ReportDuration } from "../lib/reportDuration";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** e.g. "/api/reports/cash-fund/pdf" -- appended with ?from=&to= */
  pdfPath: string;
  /** e.g. "csi-wf-cash-fund-report" -- becomes "<prefix>-<from>-to-<to>.pdf" */
  fileNamePrefix: string;
};

export default function ReportModal({ visible, onClose, pdfPath, fileNamePrefix }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [duration, setDuration] = useState<ReportDuration>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleFromChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowFromPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) setCustomFrom(dateToString(selectedDate));
  };

  const handleToChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowToPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) setCustomTo(dateToString(selectedDate));
  };

  const getRange = (): { from: string; to: string } | null => {
    if (duration === "custom") {
      if (!isValidDateString(customFrom) || !isValidDateString(customTo)) return null;
      if (customFrom > customTo) return null;
      return { from: customFrom, to: customTo };
    }
    return getDurationRange(duration);
  };

  const fetchPdf = async (): Promise<string | null> => {
    const range = getRange();
    if (!range) {
      Alert.alert("Pick a date range", "Choose a valid From and To date for the custom range.");
      return null;
    }
    const token = await getToken();
    const fileUri = `${cacheDirectory}${fileNamePrefix}-${range.from}-to-${range.to}.pdf`;
    const result = await downloadAsync(`${API_BASE_URL}${pdfPath}?from=${range.from}&to=${range.to}`, fileUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return result.uri;
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const uri = await fetchPdf();
      if (uri) Alert.alert("Saved", `Report saved to ${uri}`);
    } catch (error: any) {
      Alert.alert("Download failed", error.message || "Could not generate the PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const uri = await fetchPdf();
      if (!uri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("Saved", `Report saved to ${uri}`);
      }
    } catch (error: any) {
      Alert.alert("Share failed", error.message || "Could not generate the PDF");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <View style={styles.header}>
            <Text style={styles.title}>Report</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Select duration</Text>
          <View style={styles.durationList}>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.value} style={styles.durationRow} onPress={() => setDuration(opt.value)}>
                <Ionicons
                  name={duration === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={duration === opt.value ? colors.primary : colors.textMuted}
                />
                <Text style={styles.durationText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {duration === "custom" && (
            <View style={styles.customRangeBox}>
              <Text style={styles.label}>From</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowFromPicker(true)}>
                  <Text style={{ color: customFrom ? colors.textPrimary : colors.textMuted }}>{customFrom || "Select date"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calendarButton} onPress={() => setShowFromPicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              {showFromPicker && (
                <DateTimePicker
                  value={customFrom ? new Date(`${customFrom}T00:00:00`) : new Date()}
                  mode="date"
                  display="default"
                  onChange={handleFromChange}
                />
              )}

              <Text style={styles.label}>To</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowToPicker(true)}>
                  <Text style={{ color: customTo ? colors.textPrimary : colors.textMuted }}>{customTo || "Select date"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calendarButton} onPress={() => setShowToPicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              {showToPicker && (
                <DateTimePicker
                  value={customTo ? new Date(`${customTo}T00:00:00`) : new Date()}
                  mode="date"
                  display="default"
                  onChange={handleToChange}
                />
              )}
            </View>
          )}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleDownload} disabled={isDownloading || isSharing}>
              <Text style={styles.secondaryButtonText}>{isDownloading ? "Downloading..." : "Download"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleShare} disabled={isDownloading || isSharing}>
              <Text style={styles.buttonText}>{isSharing ? "Preparing..." : "Share"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  durationList: { gap: 4 },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  durationText: { fontSize: 15, color: colors.textPrimary },
  customRangeBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    backgroundColor: colors.surface,
  },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.background, color: colors.textPrimary, justifyContent: "center" },
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
  row: { flexDirection: "row", gap: 12, marginTop: 32 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
