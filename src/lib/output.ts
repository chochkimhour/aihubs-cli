export function colorize(
  enabled: boolean,
  code: string,
  value: string,
): string {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

export function printValue(jsonMode: boolean, value: unknown): void {
  if (jsonMode) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

export function failAndExit(
  jsonMode: boolean,
  color: (code: string, value: string) => string,
  code: string,
  message: string,
): never {
  if (jsonMode)
    console.log(JSON.stringify({ success: false, error: { code, message } }));
  else console.error(color("1;31", `✗ ${message}`));
  process.exitCode = 1;
  process.exit(1);
  throw new Error(message);
}
