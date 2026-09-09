export const lightColors = {
  primary: "#6D28D9",
  primarySoft: "#EDE4FA",
  background: "#FBF6EF",
  surface: "#FFFFFF",
  border: "#E5DED1",
  textPrimary: "#221D17",
  textSecondary: "#7A7168",
  textMuted: "#AFA598",
  danger: "#C4432E",
  dangerSoft: "#FBEEEA",
  success: "#3F8F5D",
  successSoft: "#E7F4EC",
  warning: "#B5673F",
  warningSoft: "#FBEFE7",
  white: "#FFFFFF",
  // Dashboard swipeable-card gradients -- bank card extends the app's own
  // purple brand color, cash card extends the existing warm/amber accent,
  // so the two cards read as distinct funds without introducing new hues.
  bankGradient: ["#8B5CF6", "#4C1D95"] as [string, string],
  cashGradient: ["#E0925F", "#8A3E1F"] as [string, string],
  // Event fund card -- distinct green so it reads apart from bank (purple)
  // and cash (amber) at a glance.
  eventGradient: ["#4CAF7D", "#1F5C3E"] as [string, string],
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  primary: "#8B5CF6",
  primarySoft: "#2D2447",
  background: "#15130F",
  surface: "#211C15",
  border: "#3A3327",
  textPrimary: "#F3EEE4",
  textSecondary: "#B6AC9C",
  textMuted: "#8A8071",
  danger: "#E2685A",
  dangerSoft: "#3A211C",
  success: "#5FBE86",
  successSoft: "#1D3324",
  warning: "#E0925F",
  warningSoft: "#3A2717",
  white: "#FFFFFF",
  bankGradient: ["#7C3AED", "#2E1065"] as [string, string],
  cashGradient: ["#C97A44", "#5C2C11"] as [string, string],
  eventGradient: ["#3E9C6E", "#123D28"] as [string, string],
};
