import { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { DashboardSummary } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amountsVisible, setAmountsVisible] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<DashboardSummary>("/api/dashboard"),
  });

  const mask = (value: number) => (amountsVisible ? formatCurrency(value) : "••••••");

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
    >
      <Text style={styles.greeting}>Welcome Back!</Text>
      {data && (
        <>
          <Text style={styles.subheading}>{data.monthLabel} Month Insight</Text>
          <Text style={styles.weekLabel}>This is {ordinal(data.weekOfMonth)} week</Text>
        </>
      )}

      {isError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>Failed to load dashboard. Pull down to retry.</Text>
        </View>
      )}

      {data && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Account details</Text>
              <TouchableOpacity onPress={() => setAmountsVisible((v) => !v)}>
                <Ionicons name={amountsVisible ? "eye" : "eye-off"} size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Bank balance</Text>
              <Text style={styles.balanceValue}>{mask(data.bank.balance)}</Text>
              <Text style={styles.pendingText}>Balance in hand: {mask(data.bank.inHand)}</Text>
              <Text style={styles.mutedText}>
                {data.bank.depositStatus.monthLabel} deposit{" "}
                {data.bank.depositStatus.completed ? "completed" : "pending"}
              </Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Cash balance</Text>
              <Text style={styles.balanceValue}>{mask(data.cash.balance)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Member details</Text>
            <Text style={styles.mutedText}>
              {data.members.newThisMonth > 0
                ? `${data.members.newThisMonth} new member${data.members.newThisMonth > 1 ? "s" : ""} added this month`
                : "No new members added this month yet"}
            </Text>
            <Text style={styles.totalText}>Total : {data.members.total} Members</Text>
            <Text style={styles.mutedText}>
              Active: {data.members.active} , Inactive: {data.members.inactive}, Died: {data.members.died}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Event details</Text>
            <Text style={styles.mutedText}>Event tracking coming soon</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contribution details</Text>
            <Text style={styles.mutedText}>Total Contribution collected</Text>
            <Row label="This month" value={mask(data.contributions.thisMonth)} colors={colors} />
            <Row label="This week" value={mask(data.contributions.thisWeek)} colors={colors} />
            <Row label="Total" value={mask(data.contributions.total)} bold colors={colors} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Offering details</Text>
            <Text style={styles.mutedText}>Total Offering collected</Text>
            <Row label="This month" value={mask(data.offering.thisMonth)} colors={colors} />
            <Row label="This week" value={mask(data.offering.thisWeek)} colors={colors} />
            <Row label="Total" value={mask(data.offering.total)} bold colors={colors} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold, colors }: { label: string; value: string; bold?: boolean; colors: ThemeColors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.summaryValueBold]}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    greeting: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
    subheading: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 4 },
    weekLabel: { fontSize: 13, fontStyle: "italic", color: colors.textSecondary, marginTop: 2, marginBottom: 16 },
    errorCard: { backgroundColor: colors.dangerSoft, borderRadius: 8, padding: 12, marginBottom: 16 },
    errorText: { color: colors.danger, fontSize: 14 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    cardTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
    balanceRow: { marginBottom: 8 },
    balanceLabel: { fontSize: 13, color: colors.textSecondary },
    balanceValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
    pendingText: { fontSize: 12, color: colors.warning, marginTop: 2 },
    mutedText: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    totalText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    summaryLabel: { color: colors.textSecondary },
    summaryValue: { color: colors.textPrimary, fontWeight: "600" },
    summaryValueBold: { fontSize: 16, fontWeight: "800" },
  });
