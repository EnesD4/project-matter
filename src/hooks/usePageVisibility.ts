import { useEffect, useState } from "react";

/** True while this document is the visible browser tab. */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );

  useEffect(() => {
    const onChange = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    onChange();
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return isVisible;
}
