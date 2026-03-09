type DebugValue = Record<string, unknown> | string | number | boolean | null | undefined;

type DebugState = {
  debug: boolean;
};

export function logDebug(
  state: DebugState,
  scope: string,
  event: string,
  fields: Record<string, DebugValue> = {},
): void {
  if (!state.debug) {
    return;
  }

  const orderedKeys = Object.keys(fields).sort();
  const orderedFields = orderedKeys.map((key) => `${key}=${formatDebugValue(fields[key])}`);
  const suffix = orderedFields.length > 0 ? ` ${orderedFields.join(" ")}` : "";
  console.log(`[debug:${scope}] ${event}${suffix}`);
}

function formatDebugValue(value: DebugValue): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === "object") {
    const ordered = Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, (value as Record<string, unknown>)[key]]),
    );
    return JSON.stringify(ordered);
  }

  return String(value);
}
