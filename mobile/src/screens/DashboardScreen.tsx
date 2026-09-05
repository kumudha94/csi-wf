import { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { apiRequest } from "../lib/api";
import { formatCurrency, todayString } from "../lib/format";
import type { BalanceResponse, DashboardSummary, EventSummary, MemberStatus } from "../lib/types";
import type { TabParamList } from "../navigation/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import DashboardSwipeCards, { type SwipeCardSlide } from "../components/DashboardSwipeCards";

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
  return `${n}th`;
}

type Props = BottomTabScreenProps<TabParamList, "Dashboard">;

export default function DashboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<DashboardSummary>("/api/dashboard"),
  });

  const { data: balance, refetch: refetchBalance, isFetching: isFetchingBalance } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });

  const { data: events = [], refetch: refetchEvents, isFetching: isFetchingEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<EventSummary[]>("/api/events"),
  });

  const today = todayString();
  const completedEvents = events.filter((e) => e.eventDate && e.eventDate < today).length;
  const inProgressEvents = events.length - completedEvents;

  const goToMembers = (status?: MemberStatus) => navigation.navigate("Settings", { screen: "Members", params: { initialStatus: status } });

  const slides: SwipeCardSlide[] = useMemo(() => {
    if (!balance) return [];
    return [
      {
        key: "bank",
        gradient: colors.bankGradient,
        title: "Bank Fund",
        balanceLabel: "Bank balance",
        balanceValue: formatCurrency(balance.bankFund.balance),
        tiles: [
          { key: "deposits", icon: "arrow-down-circle", label: "Deposits", value: formatCurrency(balance.bankFund.totalDeposits) },
          { key: "withdrawals", icon: "arrow-up-circle", label: "Withdrawals", value: formatCurrency(balance.bankFund.totalWithdrawals) },
          { key: "inHand", icon: "wallet", label: "In Hand", value: formatCurrency(balance.bankFund.balanceInHand) },
        ],
        onPress: () => navigation.navigate("Balance"),
      },
      {
        key: "cash",
        gradient: colors.cashGradient,
        title: "Cash Fund",
        balanceLabel: "Cash balance",
        balanceValue: formatCurrency(balance.cashFund.balance),
        tiles: [
          { key: "offering", icon: "hand-left", label: "Offering", value: formatCurrency(balance.cashFund.totalOffering) },
          { key: "donation", icon: "heart", label: "Donation", value: formatCurrency(balance.cashFund.totalDonation) },
          { key: "expenses", icon: "receipt", label: "Expenses", value: formatCurrency(balance.cashFund.totalExpenses) },
        ],
        onPress: () => navigation.navigate("CashFlow"),
      },
    ];
  }, [balance, colors, navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={["top"]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching || isFetchingBalance || isFetchingEvents}
            onRefresh={() => {
              refetch();
              refetchBalance();
              refetchEvents();
            }}
          />
        }
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

        {slides.length > 0 && <DashboardSwipeCards slides={slides} />}

        {data && (
          <>
            <Text style={styles.sectionTitle}>Members</Text>
            <Text style={styles.mutedText}>
              {data.members.newThisMonth > 0
                ? `${data.members.newThisMonth} new member${data.members.newThisMonth > 1 ? "s" : ""} added this month`
                : "No new members added this month yet"}
              {" · "}
              {data.members.total} total
            </Text>
            <View style={styles.statTileRow}>
              <StatTile
                icon="checkmark-circle"
                iconColor={colors.success}
                label="Active"
                value={data.members.active}
                colors={colors}
                onPress={() => goToMembers("active")}
              />
              <StatTile
                icon="pause-circle"
                iconColor={colors.warning}
                label="Inactive"
                value={data.members.inactive}
                colors={colors}
                onPress={() => goToMembers("inactive")}
              />
              <StatTile
                icon="flower-outline"
                iconColor={colors.danger}
                label="Died"
                value={data.members.died}
                colors={colors}
                onPress={() => goToMembers("died")}
              />
            </View>

            <Text style={styles.sectionTitle}>Events</Text>
            <View style={styles.statTileRow}>
              <StatTile
                icon="checkmark-done-circle"
                iconColor={colors.success}
                label="Completed"
                value={completedEvents}
                colors={colors}
                onPress={() => navigation.navigate("Events")}
              />
              <StatTile
                icon="time-outline"
                iconColor={colors.primary}
                label="In Progress"
                value={inProgressEvents}
                colors={colors}
                onPress={() => navigation.navigate("Events")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  icon,
  iconColor,
  label,
  value,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: number;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.statTile} onPress={onPress}>
      <View style={[styles.statTileIconCircle, { backgroundColor: `${iconColor}22` }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </TouchableOpacity>
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
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginTop: 24, marginBottom: 6 },
    mutedText: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
    statTileRow: { flexDirection: "row", gap: 10 },
    statTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 16,
      alignItems: "center",
    },
    statTileIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    statTileValue: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
    statTileLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  });
