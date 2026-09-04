import "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";
import type { ReactNode } from "react";
import Toast from "react-native-toast-message";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DashboardScreen from "./src/screens/DashboardScreen";
import MembersScreen from "./src/screens/MembersScreen";
import EventsScreen from "./src/screens/EventsScreen";
import EventDetailScreen from "./src/screens/EventDetailScreen";
import BalanceScreen from "./src/screens/BalanceScreen";
import CashFundPanel from "./src/components/CashFundPanel";
import type { EventsStackParamList, SettingsStackParamList } from "./src/navigation/types";
import SettingsScreen from "./src/screens/SettingsScreen";
import CustomFieldsScreen from "./src/screens/CustomFieldsScreen";
import OnboardingScreen from "./src/screens/auth/OnboardingScreen";
import PinLoginScreen from "./src/screens/auth/PinLoginScreen";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { NetworkProvider } from "./src/contexts/NetworkContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

export type TabParamList = {
  Dashboard: undefined;
  Events: undefined;
  Balance: undefined;
  CashFlow: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function EventsStackNavigator() {
  const { colors } = useTheme();
  return (
    <EventsStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary }}>
      <EventsStack.Screen name="EventsList" component={EventsScreen} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
    </EventsStack.Navigator>
  );
}

function SettingsStackNavigator() {
  const { colors } = useTheme();
  return (
    <SettingsStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStack.Screen name="CustomFields" component={CustomFieldsScreen} options={{ title: "Custom Member Fields" }} />
      <SettingsStack.Screen name="Members" component={MembersScreen} options={{ title: "Members" }} />
    </SettingsStack.Navigator>
  );
}

function TabNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "ellipse";
          if (route.name === "Dashboard") iconName = "home";
          else if (route.name === "Events") iconName = "calendar";
          else if (route.name === "Balance") iconName = "wallet";
          else if (route.name === "CashFlow") iconName = "cash-outline";
          else if (route.name === "Settings") iconName = "settings";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Events" component={EventsStackNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Balance" component={BalanceScreen} />
      <Tab.Screen name="CashFlow" component={CashFundPanel} />
      <Tab.Screen name="Settings" component={SettingsStackNavigator} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { isLoading, isSetUp, isAuthenticated } = useAuth();
  const { colors, scheme } = useTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  let screen: ReactNode;
  if (!isSetUp) screen = <OnboardingScreen />;
  else if (!isAuthenticated) screen = <PinLoginScreen />;
  else
    screen = (
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
    );

  return (
    <>
      {screen}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <NetworkProvider>
                <AppContent />
              </NetworkProvider>
              <Toast />
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
