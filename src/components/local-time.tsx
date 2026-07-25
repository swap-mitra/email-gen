"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/labels";

/**
 * Every timestamp in the dashboard is rendered by a server component, where
 * `toLocaleString` resolves against the deploy's timezone (UTC on Vercel)
 * rather than the viewer's — so times read as local but aren't.
 *
 * Renders UTC on the server so the markup is deterministic, then re-formats in
 * the browser's zone on mount.
 */
export function LocalTime({ value, className }: { value: Date; className?: string }) {
  const iso = value.toISOString();
  const [text, setText] = useState(() => formatDateTime(value, "UTC"));

  useEffect(() => {
    setText(formatDateTime(new Date(iso)));
  }, [iso]);

  return (
    <time className={className} dateTime={iso}>
      {text}
    </time>
  );
}
