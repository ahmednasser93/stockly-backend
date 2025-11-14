import type { AlertStateSnapshot } from "./types";

const kvKey = (id: string) => `alert:${id}:state`;

export async function readAlertState(
  kv: KVNamespace,
  id: string
): Promise<AlertStateSnapshot | null> {
  const raw = await kv.get(kvKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AlertStateSnapshot;
    return parsed;
  } catch (error) {
    console.warn("failed to parse alert state", { id, error });
    return null;
  }
}

export async function writeAlertState(
  kv: KVNamespace,
  id: string,
  state: AlertStateSnapshot
): Promise<void> {
  await kv.put(kvKey(id), JSON.stringify(state));
}

export async function deleteAlertState(kv: KVNamespace, id: string): Promise<void> {
  await kv.delete(kvKey(id));
}
