import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import type { ThemeColors } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

export default function PinLoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = async () => {
    if (pin.length < 4) return;
    setIsSubmitting(true);
    try {
      const { token } = await apiRequest<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      await login(token);
    } catch (error: any) {
      Alert.alert("Incorrect PIN", error.message || "Try again");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CSI-WF Treasurer</Text>
      <Text style={styles.subtitle}>Enter your PIN to continue</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
        autoFocus
      />
      <TouchableOpacity style={styles.button} onPress={handleUnlock} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Checking..." : "Unlock"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 8,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});
