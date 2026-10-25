"use client";

import { useI18n } from "@/lib/i18n/react";

// HAL 9000's eye. idle: breathing red · listen: wakes up · think: fast pulse ·
// refuse: flares twice · accept: cools to green.
export type HalMood = "idle" | "listen" | "think" | "refuse" | "accept";

export function HalEye({ mood = "idle", size = 120 }: { mood?: HalMood; size?: number }) {
  const { t } = useI18n();
  return (
    <div
      key={mood} /* restart the flare animation on every refusal */
      className={`hal-lens ${mood}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={t(`hal.${mood}`)}
    />
  );
}
