import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { apiRequest } from "../../lib/api";
import { setToken } from "../../lib/authStorage";
import { useAuth } from "../../contexts/AuthContext";
import type { ThemeColors } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

// First-ever launch: set the starting balance, then set the PIN that will
// protect the app from then on. Two steps in one screen since both are
// required before the account can be created.
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, markSetUp } = useAuth();
  const [openingBalance, setOpeningBalance] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const balance = parseFloat(openingBalance || "0");
    if (Number.isNaN(balance) || balance < 0) {
      Alert.alert("Invalid amount", "Enter a valid opening balance (0 or more).");
      return;
    }
    if (pin.length < 4) {
      Alert.alert("PIN too short", "Choose a PIN with at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("PINs don't match", "Re-enter the same PIN in both fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token } = await apiRequest<{ token: string }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      await setToken(token);
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify({ openingBalance: balance }) });
      await login(token);
      markSetUp();
    } catch (error: any) {
      Alert.alert("Setup failed", error.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Let's set up the fellowship's opening balance and your PIN.</Text>

      <Text style={styles.label}>Opening balance (₹)</Text>
      <TextInput
        style={styles.input}
        value={openingBalance}
        onChangeText={setOpeningBalance}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Choose a PIN (4+ digits)</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Confirm PIN</Text>
      <TextInput
        style={styles.input}
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Setting up..." : "Get Started"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});
