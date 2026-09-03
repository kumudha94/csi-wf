import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { apiRequest, API_BASE_URL } from "../lib/api";
import { getToken } from "../lib/authStorage";
import type { ReportResponse } from "../lib/types";
import { formatCurrency, todayString, dateToString, isValidDateString } from "../lib/format";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

function firstOfMonthString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [from, setFrom] = useState(firstOfMonthString());
  const [to, setTo] = useState(todayString());
  const [isExporting, setIsExporting] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const rangeValid = isValidDateString(from) && isValidDateString(to);

  const handleFromChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowFromPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setFrom(dateToString(selectedDate));
    }
  };

  const handleToChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowToPicker(Platform.OS === "ios");
    if (event.type === "set" && selectedDate) {
      setTo(dateToString(selectedDate));
    }
  };

  const { data: report, refetch, isFetching, isError } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => apiRequest<ReportResponse>(`/api/reports?from=${from}&to=${to}`),
    enabled: rangeValid,
  });

  const handleExportPdf = async () => {
    if (!rangeValid) return;
    setIsExporting(true);
    try {
      const token = await getToken();
      const fileUri = `${cacheDirectory}csi-wf-report-${from}-to-${to}.pdf`;
      const result = await downloadAsync(`${API_BASE_URL}/api/reports/pdf?from=${from}&to=${to}`, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("Saved", `Report saved to ${result.uri}`);
      }
    } catch (error: any) {
      Alert.alert("Export failed", error.message || "Could not generate the PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.rangeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>From</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowFromPicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{from}</Text>
          </TouchableOpacity>
          {showFromPicker && (
            <DateTimePicker value={new Date(`${from}T00:00:00`)} mode="date" display="default" onChange={handleFromChange} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>To</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowToPicker(true)}>
            <Text style={{ color: colors.textPrimary }}>{to}</Text>
          </TouchableOpacity>
          {showToPicker && (
            <DateTimePicker value={new Date(`${to}T00:00:00`)} mode="date" display="default" onChange={handleToChange} />
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()} disabled={!rangeValid || isFetching}>
        <Text style={styles.refreshButtonText}>{isFetching ? "Loading..." : "Refresh"}</Text>
      </TouchableOpacity>

      {isError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>Failed to load report. Please try again.</Text>
        </View>
      )}

      {report ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Bank Fund</Text>
          <Row label="Opening balance" value={formatCurrency(report.openingBalance)} />
          <Row label="Contributions received" value={formatCurrency(report.totalContributions)} />
          <Row label="Expenses paid" value={formatCurrency(report.totalPaidExpenses)} />
          <Row label="Expenses pending" value={formatCurrency(report.totalPendingExpenses)} />
          <Row label="Closing balance" value={formatCurrency(report.closingBalance)} bold />
        </View>
      ) : null}

      {report?.cashFund ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Cash Fund</Text>
          <Row label="Opening balance" value={formatCurrency(report.cashFund.openingBalance)} />
          <Row label="Offering received" value={formatCurrency(report.cashFund.totalOffering)} />
          <Row label="Donations received" value={formatCurrency(report.cashFund.totalDonation)} />
          <Row label="Expenses" value={formatCurrency(report.cashFund.totalExpenses)} />
          <Row label="Closing balance" value={formatCurrency(report.cashFund.closingBalance)} bold />
        </View>
      ) : null}

      <TouchableOpacity style={styles.exportButton} onPress={handleExportPdf} disabled={!rangeValid || isExporting}>
        <Text style={styles.exportButtonText}>{isExporting ? "Preparing PDF..." : "Share / Export PDF"}</Text>
      </TouchableOpacity>

      {report ? (
        <>
          <Text style={styles.sectionTitle}>Expenses ({report.expenses.length})</Text>
          {report.expenses.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.expenses.map((e, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listRowTitle}>
                  [{e.eventName ?? "General"}] {e.description}
                </Text>
                <Text style={styles.listRowMeta}>
                  {e.date} · {formatCurrency(e.amount)} · {e.status}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Contributions ({report.contributions.length})</Text>
          {report.contributions.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.contributions.map((c, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listRowTitle}>{c.memberName}</Text>
                <Text style={styles.listRowMeta}>
                  {c.date} · {formatCurrency(c.amount)}
                  {c.note ? ` · ${c.note}` : ""}
                </Text>
              </View>
            ))
          )}

          {report.cashFund ? (
            <>
              <Text style={styles.sectionTitle}>Cash Fund Income ({report.cashFund.income.length})</Text>
              {report.cashFund.income.length === 0 ? (
                <Text style={styles.emptyText}>None in this period.</Text>
              ) : (
                report.cashFund.income.map((i, idx) => (
                  <View key={idx} style={styles.listRow}>
                    <Text style={styles.listRowTitle}>
                      {i.type === "donation" ? i.donorName || "Donation" : "Offering"}
                    </Text>
                    <Text style={styles.listRowMeta}>
                      {i.date} · {formatCurrency(i.amount)}
                      {i.note ? ` · ${i.note}` : ""}
                    </Text>
                  </View>
                ))
              )}

              <Text style={styles.sectionTitle}>Cash Fund Expenses ({report.cashFund.expenses.length})</Text>
              {report.cashFund.expenses.length === 0 ? (
                <Text style={styles.emptyText}>None in this period.</Text>
              ) : (
                report.cashFund.expenses.map((e, idx) => (
                  <View key={idx} style={styles.listRow}>
                    <Text style={styles.listRowTitle}>{e.description}</Text>
                    <Text style={styles.listRowMeta}>
                      {e.date} · {formatCurrency(e.amount)}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.summaryValueBold]}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  rangeRow: { flexDirection: "row", gap: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface, color: colors.textPrimary },
  refreshButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  refreshButtonText: { color: colors.textPrimary, fontWeight: "600" },
  errorCard: { backgroundColor: colors.dangerSoft, borderRadius: 8, padding: 12, marginTop: 12 },
  errorText: { color: colors.danger, fontSize: 14 },
  summaryCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { color: colors.textSecondary },
  summaryValue: { color: colors.textPrimary, fontWeight: "600" },
  summaryValueBold: { fontSize: 16, fontWeight: "800" },
  exportButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  exportButtonText: { color: colors.white, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 24, marginBottom: 8 },
  listRow: { backgroundColor: colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  listRowTitle: { color: colors.textPrimary, fontWeight: "600" },
  listRowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  emptyText: { color: colors.textMuted, marginBottom: 8 },
});
