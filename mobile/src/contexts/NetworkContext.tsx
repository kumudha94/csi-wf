import { createContext, useContext, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useTheme } from "./ThemeContext";

interface NetworkContextValue {
  isConnected: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isConnected: true });

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { isConnected } = useNetworkStatus();
  const { colors } = useTheme();

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {!isConnected && (
        <View style={[styles.banner, { backgroundColor: colors.danger }]}>
          <Ionicons name="cloud-offline" size={16} color={colors.white} />
          <Text style={[styles.bannerText, { color: colors.white }]}>No Internet Connection</Text>
        </View>
      )}
      {children}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
