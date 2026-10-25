"use client";

// HAL 9000's eye. idle: breathing red · refuse: flares twice · accept: cools to green.
export type HalMood = "idle" | "refuse" | "accept";

export function HalEye({ mood = "idle", size = 120 }: { mood?: HalMood; size?: number }) {
  return (
    <div
      key={mood} /* restart the flare animation on every refusal */
      className={`hal-lens ${mood}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={mood === "refuse" ? "HAL refuse la clé" : mood === "accept" ? "HAL accepte la clé" : "Œil de HAL"}
    />
  );
}
