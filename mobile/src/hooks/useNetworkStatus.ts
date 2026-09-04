import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [hasShownOfflineToast, setHasShownOfflineToast] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);

      if (!connected && !hasShownOfflineToast) {
        Toast.show({
          type: "error",
          text1: "No Internet Connection",
          text2: "Please check your network settings",
          position: "top",
          visibilityTime: 4000,
        });
        setHasShownOfflineToast(true);
      } else if (connected && hasShownOfflineToast) {
        Toast.show({
          type: "success",
          text1: "Back Online",
          text2: "Internet connection restored",
          position: "top",
          visibilityTime: 2000,
        });
        setHasShownOfflineToast(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [hasShownOfflineToast]);

  return { isConnected };
}
