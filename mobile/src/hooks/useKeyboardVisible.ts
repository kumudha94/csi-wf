import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

// Used to collapse a screen's summary/balance card while the keyboard is up
// during an active search, giving the results list more room.
export function useKeyboardVisible(): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setIsVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setIsVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return isVisible;
}
