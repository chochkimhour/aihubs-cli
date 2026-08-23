import { SENSITIVE_KEY } from "../constants.js";

export function redact(v: any): any {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !SENSITIVE_KEY.test(k))
        .map(([k, x]) => [k, redact(x)]),
    );
  return v;
}
