export type Activity = "work" | "stroll" | "rest";

export interface ScheduleProfile {
  workStart: number;
  workEnd: number;
  restStart: number;
  restEnd: number;
}

export const DEFAULT_SCHEDULE: ScheduleProfile = {
  workStart: 8,
  workEnd: 18,
  restStart: 23,
  restEnd: 6.5,
};

/** A tiny utility-driven schedule: what should this citizen be doing now? */
export function activityForHour(hour: number, profile: ScheduleProfile = DEFAULT_SCHEDULE): Activity {
  const h = ((hour % 24) + 24) % 24;
  const inRest = profile.restStart > profile.restEnd
    ? h >= profile.restStart || h < profile.restEnd
    : h >= profile.restStart && h < profile.restEnd;
  if (inRest) return "rest";
  if (h >= profile.workStart && h < profile.workEnd) return "work";
  return "stroll";
}

export function timeOfDayLabel(hour: number): "dawn" | "morning" | "afternoon" | "evening" | "night" {
  if (hour < 5) return "night";
  if (hour < 7.5) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 17.5) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function greetingForHour(hour: number): string {
  switch (timeOfDayLabel(hour)) {
    case "dawn":
      return "You're up early.";
    case "morning":
      return "Morning.";
    case "afternoon":
      return "Afternoon.";
    case "evening":
      return "Evening.";
    default:
      return "Late night, huh?";
  }
}
