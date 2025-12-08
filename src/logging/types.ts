/**
 * Type definitions for logged environment
 */

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Logger } from "./logger";
import { LoggedD1Database } from "./d1-wrapper";
import { LoggedKVNamespace } from "./kv-wrapper";

export interface LoggedEnv {
  stockly: LoggedD1Database;
  alertsKv?: LoggedKVNamespace;
  FCM_SERVICE_ACCOUNT?: string;
  FMP_API_KEY?: string;
  LOKI_URL?: string;
}


