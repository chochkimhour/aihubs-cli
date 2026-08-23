#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./app.js";

export { billingValue, parseUsage } from "./providers/billing.js";
export {
  formatLastActivity,
  formatResetAt,
  formatTokenLeft,
} from "./lib/format.js";

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void run();
}
