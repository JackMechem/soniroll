import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from "@jam-practice/core/instruments";

export * from "@jam-practice/core/instruments";

const SHORT_NAMES: Record<string, string> = { bass4: "Bass", bass5: "5-string bass" };

/** A short name for an option chip: "Bass", "Guitar", "Keyboard", "Alto Saxophone", "Custom". */
export function instrumentShortName(id: string): string {
  if (id === CUSTOM_INSTRUMENT_ID) return "Custom";
  const label = INSTRUMENTS.find((i) => i.id === id)?.label ?? "";
  return SHORT_NAMES[id] ?? label.split(" (")[0].split(" — ")[0];
}
