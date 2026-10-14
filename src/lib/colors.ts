export const CHIP_COLORS: Record<string, { bg: string; fg: string }> = {
  blue: { bg: "#cfdfff", fg: "#102046" },
  cyan: { bg: "#d0f0fd", fg: "#04283f" },
  teal: { bg: "#c2f5e9", fg: "#012722" },
  green: { bg: "#d1f7c4", fg: "#0b1d05" },
  yellow: { bg: "#ffeab6", fg: "#3b2501" },
  orange: { bg: "#fee2d5", fg: "#6b2613" },
  red: { bg: "#ffdce5", fg: "#4c0c1c" },
  pink: { bg: "#ffdaf6", fg: "#400832" },
  purple: { bg: "#ede2fe", fg: "#280b42" },
  gray: { bg: "#eeeeee", fg: "#040404" },
};

export const BASE_COLORS: Record<string, string> = {
  blue: "#2d7ff9",
  cyan: "#18bfff",
  teal: "#11b5ae",
  green: "#20c933",
  yellow: "#fcb400",
  orange: "#ff6f2c",
  red: "#f82b60",
  pink: "#ff08c2",
  purple: "#8b46ff",
  gray: "#666666",
};

export function chip(color: string) {
  return CHIP_COLORS[color] ?? CHIP_COLORS.gray;
}
