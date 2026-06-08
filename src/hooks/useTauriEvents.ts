import { useEffect } from "react";
import { listen, Event } from "@tauri-apps/api/event";

export function useTauriEvents<T>(
  eventName: string,
  callback: (event: Event<T>) => void,
  dependencies: any[] = []
) {
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unlisten = await listen<T>(eventName, (event) => {
          callback(event);
        });
        unlistenFn = unlisten;
      } catch (err) {
        console.error(`Failed to subscribe to event ${eventName}:`, err);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [eventName, ...dependencies]);
}
