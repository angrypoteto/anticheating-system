"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Reachable } from "./ui";

/**
 * Whether live updates actually reach this browser.
 *
 * The other three health rows are answered on the server, but realtime cannot
 * be: the server can confirm the publication exists and still leave the
 * monitor silent behind a proxy that drops websockets. The only honest test is
 * to open the socket from the same place the monitor will open it, which is
 * here. So this one row is a client component, and it says "checking" until it
 * knows rather than guessing "connected".
 */
export function LiveStatus() {
  const [state, setState] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin:health").subscribe((status) => {
      if (status === "SUBSCRIBED") setState("up");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setState("down");
      }
    });

    // A socket that never resolves either way is a failure, not a pending state.
    const giveUp = setTimeout(() => setState((s) => (s === "checking" ? "down" : s)), 8000);

    return () => {
      clearTimeout(giveUp);
      supabase.removeChannel(channel);
    };
  }, []);

  if (state === "checking") {
    return <span className="text-[13px] text-gray-500">Checking…</span>;
  }
  return <Reachable ok={state === "up"}>{state === "up" ? "Connected" : "Not reaching"}</Reachable>;
}
