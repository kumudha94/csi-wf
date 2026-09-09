import { useRef, useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutAnimation, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

// Must match the horizontal padding of whatever screen renders this, so
// each card exactly fills the visible width with no partial peek of the
// next one (DashboardScreen's ScrollView uses padding: 16).
const SCREEN_PADDING = 16;
const CARD_WIDTH = Dimensions.get("window").width - SCREEN_PADDING * 2;

export type SwipeCardTile = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

export type SwipeCardSlide = {
  key: string;
  gradient: [string, string];
  title: string;
  balanceLabel: string;
  balanceValue: string;
  tiles: SwipeCardTile[];
  onPress: () => void;
};

type Props = {
  slides: SwipeCardSlide[];
  autoPlayIntervalMs?: number;
};

export default function DashboardSwipeCards({ slides, autoPlayIntervalMs = 4000 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heldKey, setHeldKey] = useState<string | null>(null);
  const indexRef = useRef(0);
  const isDraggingRef = useRef(false);
  // Pressable can still fire onPress on release even after onLongPress
  // already fired for the same touch -- this guards against that so
  // releasing a long-press never also triggers navigation.
  const longPressFiredRef = useRef(false);

  const showDetails = (key: string) => {
    longPressFiredRef.current = true;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    isDraggingRef.current = true;
    setHeldKey(key);
  };

  const hideDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    isDraggingRef.current = false;
    setHeldKey(null);
  };

  useEffect(() => {
    if (slides.length < 2) return;
    const interval = setInterval(() => {
      if (isDraggingRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * CARD_WIDTH, animated: true });
      indexRef.current = next;
      setActiveIndex(next);
    }, autoPlayIntervalMs);
    return () => clearInterval(interval);
  }, [slides.length, autoPlayIntervalMs]);

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    indexRef.current = index;
    setActiveIndex(index);
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
        }}
        onScrollEndDrag={() => {
          isDraggingRef.current = false;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {slides.map((slide) => {
          const isHeld = heldKey === slide.key;
          return (
            <Pressable
              key={slide.key}
              onPress={() => {
                if (longPressFiredRef.current) return;
                slide.onPress();
              }}
              onLongPress={() => showDetails(slide.key)}
              onPressOut={() => {
                if (longPressFiredRef.current) {
                  longPressFiredRef.current = false;
                  hideDetails();
                }
              }}
              delayLongPress={300}
              style={{ width: CARD_WIDTH }}
            >
              <LinearGradient colors={slide.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
                <Text style={styles.cardTitle}>{slide.title}</Text>
                <Text style={styles.balanceLabel}>{slide.balanceLabel}</Text>
                <Text style={styles.balanceValue}>{slide.balanceValue}</Text>
                {isHeld ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.tileRow}>
                      {slide.tiles.map((tile) => (
                        <View key={tile.key} style={styles.tile}>
                          <View style={styles.tileIconCircle}>
                            <Ionicons name={tile.icon} size={16} color={colors.white} />
                          </View>
                          <Text style={styles.tileValue} numberOfLines={1}>
                            {tile.value}
                          </Text>
                          <Text style={styles.tileLabel}>{tile.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.holdHint}>Hold to see details · Tap to open</Text>
                )}
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
      {slides.length > 1 && (
        <View style={styles.dotsRow}>
          {slides.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { width: CARD_WIDTH, borderRadius: 16, padding: 20 },
    cardTitle: { color: colors.white, fontSize: 14, fontWeight: "700", opacity: 0.85 },
    balanceLabel: { color: colors.white, fontSize: 12, opacity: 0.75, marginTop: 10 },
    balanceValue: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
    holdHint: { color: colors.white, fontSize: 11, opacity: 0.65, marginTop: 14 },
    divider: { height: 1, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 16, marginBottom: 14 },
    tileRow: { flexDirection: "row", justifyContent: "space-between" },
    tile: { alignItems: "center", flex: 1 },
    tileIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    tileValue: { color: colors.white, fontSize: 14, fontWeight: "700" },
    tileLabel: { color: colors.white, fontSize: 11, opacity: 0.75, marginTop: 2 },
    dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primary, width: 18 },
  });
