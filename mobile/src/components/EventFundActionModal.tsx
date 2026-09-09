import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import type { EventFundTarget } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: number;
  mode: "surplus" | "shortfall";
  amount: number;
};

const FUND_LABEL: Record<EventFundTarget, string> = { bank: "BankFund", cash: "CashFund" };

// Surplus: move an eventFund event's leftover collection into BankFund/CashFund.
// Shortfall: cover an eventFund event's deficit by pulling from BankFund/CashFund.
// Both are full-amount, one irreversible step, so both share this Cancel /
// BankFund / CashFund -> confirm flow.
export default function EventFundActionModal({ visible, onClose, eventId, mode, amount }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (target: EventFundTarget) =>
      apiRequest(`/api/events/${eventId}/${mode === "surplus" ? "transfer" : "cover-shortfall"}`, {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
    onError: (error: any) =>
      Alert.alert(mode === "surplus" ? "Could not transfer the fund" : "Could not cover the shortfall", error.message),
  });

  const confirmTarget = (target: EventFundTarget) => {
    const label = FUND_LABEL[target];
    Alert.alert(
      "Are you sure?",
      `If the ${label} amount is wrong you can change it in the Settings screen, but this action cannot be undone.`,
      [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: () => mutation.mutate(target) },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {mode === "surplus" ? "Move leftover fund" : "Cover fund shortfall"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "surplus"
              ? `This event has ${formatCurrency(amount)} remaining. Move it to:`
              : `This event is short by ${formatCurrency(amount)}. Cover it from:`}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose} disabled={mutation.isPending}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => confirmTarget("bank")} disabled={mutation.isPending}>
              <Text style={styles.buttonText}>BankFund</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => confirmTarget("cash")} disabled={mutation.isPending}>
              <Text style={styles.buttonText}>CashFund</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
    sheet: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
    title: { fontSize: 17, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
    row: { flexDirection: "row", gap: 10 },
    button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
    buttonText: { color: colors.white, fontSize: 13, fontWeight: "600" },
    secondaryButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  });
