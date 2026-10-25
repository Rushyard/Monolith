"use client";

// HAL 9000's eye. idle: breathing red · listen: wakes up · think: fast pulse ·
// refuse: flares twice · accept: cools to green.
export type HalMood = "idle" | "listen" | "think" | "refuse" | "accept";

const LABEL: Record<HalMood, string> = {
  idle: "Œil de HAL",
  listen: "HAL écoute",
  think: "HAL réfléchit",
  refuse: "HAL refuse",
  accept: "HAL accepte",
};

export function HalEye({ mood = "idle", size = 120 }: { mood?: HalMood; size?: number }) {
  return (
    <div
      key={mood} /* restart the flare animation on every refusal */
      className={`hal-lens ${mood}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={LABEL[mood]}
    />
  );
}
