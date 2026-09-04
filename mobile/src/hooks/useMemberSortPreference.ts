import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

export type MemberSortField = "santhaNumber" | "name";
export type MemberSortDir = "asc" | "desc";

export type MemberSortPreference = {
  field: MemberSortField;
  dir: MemberSortDir;
};

const STORAGE_KEY = "csiwf_member_sort";
const DEFAULT_PREFERENCE: MemberSortPreference = { field: "santhaNumber", dir: "asc" };

export function useMemberSortPreference() {
  const [preference, setPreferenceState] = useState<MemberSortPreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (
          (parsed.field === "santhaNumber" || parsed.field === "name") &&
          (parsed.dir === "asc" || parsed.dir === "desc")
        ) {
          setPreferenceState(parsed);
        }
      } catch {
        // ignore corrupt stored value, keep default
      }
    });
  }, []);

  const setPreference = useCallback((next: MemberSortPreference) => {
    setPreferenceState(next);
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { preference, setPreference };
}
