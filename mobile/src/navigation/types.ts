import type { NavigatorScreenParams } from "@react-navigation/native";
import type { MemberStatus } from "../lib/types";

export type EventsStackParamList = {
  EventsList: undefined;
  EventDetail: { eventId: number };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  CustomFields: undefined;
  Members: { initialStatus?: MemberStatus } | undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Events: undefined;
  Balance: undefined;
  CashFlow: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
