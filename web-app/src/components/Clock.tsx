"use client";

import { useEffect, useState } from "react";

/** The time in UTC, ticking every second. Blank until the browser takes over, so it never mismatches. */
export function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span suppressHydrationWarning>{now ?? "--:--:--"} UTC</span>;
}
