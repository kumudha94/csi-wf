import { useMemo } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onOpenAdvanced: () => void;
  hasActiveFilter: boolean;
  placeholder?: string;
};

// Reason-text search + an "advanced search" button that opens a date-range
// filter modal (see DateRangeFilterModal). The inline clear ("x") only
// appears once the user has actually typed something; the advanced button
// stays highlighted whenever a date range filter is applied, independent
// of the text field.
export default function TransactionSearchBar({ value, onChangeText, onOpenAdvanced, hasActiveFilter, placeholder }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "Search by reason"}
          placeholderTextColor={colors.textMuted}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[styles.advancedButton, hasActiveFilter && styles.advancedButtonActive]}
        onPress={onOpenAdvanced}
      >
        <Ionicons name="options-outline" size={20} color={hasActiveFilter ? colors.white : colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 12, alignItems: "center" },
    inputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    input: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
    advancedButton: {
      width: 42,
      height: 42,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    advancedButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  });
