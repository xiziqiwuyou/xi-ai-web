import { useCallback, useEffect, useRef, useState } from "react";

export type ShellScrollOwner = "navigation" | "workspace";

export function useShellScrollActivity(idleDelayMs = 520) {
  const [activeOwner, setActiveOwner] = useState<ShellScrollOwner | null>(null);
  const idleTimeoutRef = useRef<number | undefined>(undefined);

  const markActive = useCallback((owner: ShellScrollOwner) => {
    setActiveOwner(owner);
    window.clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = window.setTimeout(() => setActiveOwner(null), idleDelayMs);
  }, [idleDelayMs]);

  useEffect(() => () => window.clearTimeout(idleTimeoutRef.current), []);

  return { activeOwner, markActive };
}
