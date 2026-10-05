import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { formatCurrency, formatDisplayDate } from "../lib/format";

type Props = {
  from: string;
  to: string;
  count: number;
  totalAmount: number;
  // Optional extra line under the totals, e.g. Transfers' deposit/withdrawal
  // split, where a single net total alone would hide what happened.
  breakdown?: string;
};

// Shown under a TransactionSearchBar only while a date-range filter is
// applied, summarising the rows currently visible in the list.
export default function FilterSummaryCard({ from, to, count, totalAmount, breakdown }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Text style={styles.range}>
        {formatDisplayDate(from)} to {formatDisplayDate(to)}
      </Text>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Total no. of transactions</Text>
          <Text style={styles.value}>{count}</Text>
        </View>
        <View style={[styles.cell, styles.cellRight]}>
          <Text style={styles.label}>Total amount</Text>
          <Text style={styles.value}>{formatCurrency(totalAmount)}</Text>
        </View>
      </View>
      {breakdown ? <Text style={styles.breakdown}>{breakdown}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.primarySoft,
      marginHorizontal: 16,
      marginBottom: 4,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    range: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
    row: { flexDirection: "row", marginTop: 8 },
    cell: { flex: 1 },
    cellRight: { alignItems: "flex-end" },
    label: { fontSize: 12, color: colors.textSecondary },
    value: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
    breakdown: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  });
