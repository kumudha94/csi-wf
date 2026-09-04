import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest, API_BASE_URL } from "../lib/api";
import { getToken } from "../lib/authStorage";
import { todayString } from "../lib/format";
import type { Member, MemberStatus } from "../lib/types";
import type { ThemeColors } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import type { MemberSortPreference } from "../hooks/useMemberSortPreference";
import MemberPickerModal from "./MemberPickerModal";

const STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "died", label: "Died" },
];

const SECONDARY_COLUMNS: { key: string; label: string }[] = [
  { key: "oldMemNo", label: "Old Santha No" },
  { key: "phone", label: "Phone Number" },
  { key: "age", label: "Age" },
  { key: "address", label: "Address" },
  { key: "remarks", label: "Remarks" },
];
const DEFAULT_SECONDARY_COLUMNS = ["oldMemNo", "phone", "age"];

type Props = {
  visible: boolean;
  onClose: () => void;
  sortPreference: MemberSortPreference;
  onSaveSort: (preference: MemberSortPreference) => void;
};

export default function MemberSettingsModal({ visible, onClose, sortPreference, onSaveSort }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [filteringOpen, setFilteringOpen] = useState(true);
  const [downloadOpen, setDownloadOpen] = useState(true);

  const [sortField, setSortField] = useState(sortPreference.field);
  const [sortDir, setSortDir] = useState(sortPreference.dir);

  const [scopeMode, setScopeMode] = useState<"all" | "status">("all");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<MemberStatus>>(new Set());

  const [additionalColumnsEnabled, setAdditionalColumnsEnabled] = useState(false);
  const [extraColumns, setExtraColumns] = useState<string[]>(["Signature"]);

  const [specificMembersEnabled, setSpecificMembersEnabled] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const [secondaryColumns, setSecondaryColumns] = useState<Set<string>>(new Set(DEFAULT_SECONDARY_COLUMNS));
  const [isDownloading, setIsDownloading] = useState(false);

  // Every field here resets fresh each time the modal opens, matching the
  // rest of the Download section (only the sort preference persists).
  useEffect(() => {
    if (!visible) return;
    setFilteringOpen(true);
    setDownloadOpen(true);
    setSortField(sortPreference.field);
    setSortDir(sortPreference.dir);
    setScopeMode("all");
    setSelectedStatuses(new Set());
    setAdditionalColumnsEnabled(false);
    setExtraColumns(["Signature"]);
    setSpecificMembersEnabled(false);
    setSelectedMemberIds([]);
    setSecondaryColumns(new Set(DEFAULT_SECONDARY_COLUMNS));
  }, [visible, sortPreference]);

  // The member picker's candidate pool changes whenever the scope changes, so
  // a previously picked set could include members no longer in that pool.
  const statusKey = Array.from(selectedStatuses).sort().join(",");
  useEffect(() => {
    setSelectedMemberIds([]);
  }, [scopeMode, statusKey]);

  const { data: allMembers = [] } = useQuery({
    queryKey: ["members-export-pool"],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible,
  });

  const candidatePool = useMemo(() => {
    if (scopeMode === "all") return allMembers;
    if (selectedStatuses.size === 0) return [];
    return allMembers.filter((m) => selectedStatuses.has(m.status));
  }, [allMembers, scopeMode, selectedStatuses]);

  const toggleStatus = (status: MemberStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const toggleSecondaryColumn = (key: string) => {
    setSecondaryColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateExtraColumn = (index: number, value: string) => {
    setExtraColumns((prev) => prev.map((c, i) => (i === index ? value : c)));
  };

  const removeExtraColumn = (index: number) => {
    setExtraColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const addExtraColumn = () => {
    setExtraColumns((prev) => [...prev, ""]);
  };

  const canDownload = scopeMode === "all" || selectedStatuses.size > 0;

  const handleSaveSort = () => {
    onSaveSort({ field: sortField, dir: sortDir });
  };

  const handleDownload = async () => {
    if (!canDownload) return;
    setIsDownloading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set("sortBy", sortField);
      params.set("sortDir", sortDir);

      if (specificMembersEnabled && selectedMemberIds.length > 0) {
        params.set("memberIds", selectedMemberIds.join(","));
      } else if (scopeMode === "status") {
        params.set("statuses", Array.from(selectedStatuses).join(","));
      }

      if (secondaryColumns.size > 0) {
        params.set("columns", Array.from(secondaryColumns).join(","));
      }

      if (additionalColumnsEnabled) {
        const cleaned = extraColumns.map((c) => c.trim()).filter(Boolean);
        if (cleaned.length > 0) params.set("extraColumns", cleaned.join(","));
      }

      const fileUri = `${cacheDirectory}csi-wf-members-${todayString()}.xlsx`;
      const result = await downloadAsync(`${API_BASE_URL}/api/members/export?${params.toString()}`, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else {
        Alert.alert("Saved", `Members exported to ${result.uri}`);
      }
      onClose();
    } catch (error: any) {
      Alert.alert("Export failed", error.message || "Could not generate the file");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Member Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
          {/* Filtering */}
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setFilteringOpen((v) => !v)}>
            <Text style={styles.sectionTitle}>Filtering</Text>
            <Ionicons name={filteringOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {filteringOpen && (
            <View style={styles.sectionBody}>
              <SortRow
                label="Sorting with santha number"
                selected={sortField === "santhaNumber"}
                dir={sortField === "santhaNumber" ? sortDir : null}
                onSelect={(dir) => {
                  setSortField("santhaNumber");
                  setSortDir(dir);
                }}
                colors={colors}
              />
              <SortRow
                label="Sorting with member name"
                selected={sortField === "name"}
                dir={sortField === "name" ? sortDir : null}
                onSelect={(dir) => {
                  setSortField("name");
                  setSortDir(dir);
                }}
                colors={colors}
              />
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveSort}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.divider} />

          {/* Download */}
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setDownloadOpen((v) => !v)}>
            <Text style={styles.sectionTitle}>Download</Text>
            <Ionicons name={downloadOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {downloadOpen && (
            <View style={styles.sectionBody}>
              <View style={styles.scopeRow}>
                <RadioOption label="All Members" selected={scopeMode === "all"} onPress={() => setScopeMode("all")} colors={colors} />
                <RadioOption
                  label="Specific status"
                  selected={scopeMode === "status"}
                  onPress={() => setScopeMode("status")}
                  colors={colors}
                />
              </View>

              {scopeMode === "status" && (
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((opt) => (
                    <CheckOption
                      key={opt.value}
                      label={opt.label}
                      checked={selectedStatuses.has(opt.value)}
                      onPress={() => toggleStatus(opt.value)}
                      colors={colors}
                    />
                  ))}
                </View>
              )}
              {scopeMode === "status" && selectedStatuses.size === 0 && (
                <Text style={styles.hintText}>Select at least one status to download.</Text>
              )}

              <Text style={styles.advancedHeading}>Advanced settings</Text>

              {/* Additional (blank, print-only) columns */}
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Additional columns</Text>
                <Switch value={additionalColumnsEnabled} onValueChange={setAdditionalColumnsEnabled} />
              </View>
              {additionalColumnsEnabled && (
                <View style={styles.extraColumnsBlock}>
                  {extraColumns.map((value, index) => (
                    <View key={index} style={styles.extraColumnRow}>
                      <TextInput
                        style={styles.extraColumnInput}
                        value={value}
                        onChangeText={(text) => updateExtraColumn(index, text)}
                        placeholder="Column name"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity style={styles.extraColumnButton} onPress={() => removeExtraColumn(index)}>
                        <Ionicons name="close" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={[styles.extraColumnButton, styles.addColumnButton]} onPress={addExtraColumn}>
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Select specific members */}
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Select specific members</Text>
                <Switch
                  value={specificMembersEnabled}
                  onValueChange={(value) => {
                    setSpecificMembersEnabled(value);
                    if (!value) setSelectedMemberIds([]);
                  }}
                />
              </View>
              {specificMembersEnabled && (
                <TouchableOpacity style={styles.pickerLink} onPress={() => setPickerVisible(true)}>
                  <Text style={styles.pickerLinkText}>
                    {selectedMemberIds.length} Members added, tap here to {selectedMemberIds.length > 0 ? "change" : "add"} members
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}

              {/* Secondary columns */}
              <Text style={styles.secondaryHeading}>Decide on what existing columns should present</Text>
              <View style={styles.secondaryGrid}>
                {SECONDARY_COLUMNS.map((col) => (
                  <CheckOption
                    key={col.key}
                    label={col.label}
                    checked={secondaryColumns.has(col.key)}
                    onPress={() => toggleSecondaryColumn(col.key)}
                    colors={colors}
                  />
                ))}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadButton, (!canDownload || isDownloading) && styles.downloadButtonDisabled]}
                  onPress={handleDownload}
                  disabled={!canDownload || isDownloading}
                >
                  <Text style={styles.downloadButtonText}>{isDownloading ? "Preparing..." : "Download"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <MemberPickerModal
        visible={pickerVisible}
        candidates={candidatePool}
        initialSelectedIds={selectedMemberIds}
        onClose={() => setPickerVisible(false)}
        onDone={(ids) => {
          setSelectedMemberIds(ids);
          setPickerVisible(false);
        }}
      />
    </Modal>
  );
}

function SortRow({
  label,
  selected,
  dir,
  onSelect,
  colors,
}: {
  label: string;
  selected: boolean;
  dir: "asc" | "desc" | null;
  onSelect: (dir: "asc" | "desc") => void;
  colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  return (
    <View style={styles.sortRow}>
      <Text style={styles.sortLabel}>{label}</Text>
      <View style={styles.sortOptions}>
        <RadioOption label="asc" selected={selected && dir === "asc"} onPress={() => onSelect("asc")} colors={colors} />
        <RadioOption label="desc" selected={selected && dir === "desc"} onPress={() => onSelect("desc")} colors={colors} />
      </View>
    </View>
  );
}

function RadioOption({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress}>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.primary : colors.textMuted} />
      <Text style={styles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function CheckOption({
  label,
  checked,
  onPress,
  colors,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? colors.primary : colors.textMuted} />
      <Text style={styles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 8,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, textDecorationLine: "underline" },
    sectionBody: { paddingTop: 12, paddingBottom: 8 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },

    sortRow: { marginBottom: 14 },
    sortLabel: { fontSize: 14, color: colors.textPrimary, marginBottom: 8, fontWeight: "600" },
    sortOptions: { flexDirection: "row", gap: 24 },

    optionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    optionLabel: { fontSize: 14, color: colors.textPrimary },

    saveButton: {
      alignSelf: "center",
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 28,
      marginTop: 4,
    },
    saveButtonText: { color: colors.white, fontWeight: "700" },

    scopeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 20, marginBottom: 8, paddingLeft: 8 },
    hintText: { color: colors.danger, fontSize: 12, marginBottom: 8 },

    advancedHeading: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginTop: 16, marginBottom: 10 },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
    },
    toggleLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: "600" },

    extraColumnsBlock: { marginBottom: 8, gap: 8 },
    extraColumnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    extraColumnInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
    },
    extraColumnButton: {
      width: 38,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    addColumnButton: { alignSelf: "flex-start" },

    pickerLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.primarySoft,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    pickerLinkText: { color: colors.primary, fontWeight: "600", flex: 1, fontSize: 13 },

    secondaryHeading: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginTop: 12, marginBottom: 10 },
    secondaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 8 },

    actionRow: { flexDirection: "row", gap: 12, marginTop: 20 },
    cancelButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: "center",
    },
    cancelButtonText: { color: colors.textPrimary, fontWeight: "600" },
    downloadButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: "center",
    },
    downloadButtonDisabled: { opacity: 0.5 },
    downloadButtonText: { color: colors.white, fontWeight: "700" },
  });
