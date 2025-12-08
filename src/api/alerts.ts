import { json } from "../util";
import type { Env } from "../index";
import { createAlert, deleteAlert, getAlert, listAlerts, updateAlert } from "../alerts/storage";
import { deleteAlertState } from "../alerts/state";
import { validateAlertUpdate, validateNewAlert } from "../alerts/validation";
import type { Logger } from "../logging/logger";

const ALERT_PREFIX = "/v1/api/alerts";

async function readBody(request: Request, logger: Logger): Promise<unknown | null> {
  try {
    return await request.json();
  } catch (error) {
    logger.warn("failed to parse request body", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function handleAlertsRequest(
  request: Request,
  env: Env,
  logger: Logger
): Promise<Response> {
  const url = new URL(request.url);
  const tail = url.pathname.slice(ALERT_PREFIX.length);
  const segments = tail.split("/").filter(Boolean);

  if (!segments.length) {
    if (request.method === "GET") {
      const alerts = await listAlerts(env);
      logger.info("Fetched alerts from D1");
      return json({ alerts });
    }

    if (request.method === "POST") {
      const payload = await readBody(request, logger);
      if (!payload) {
        return json({ error: "invalid JSON payload" }, 400);
      }
      const validation = validateNewAlert(payload);
      if (!validation.ok) {
        return json({ error: validation.errors.join(", ") }, 400);
      }

      try {
        const alert = await createAlert(env, validation.data);
        logger.info("Created alert", { alertId: alert.id });
        return json(alert, 201);
      } catch (error) {
        logger.error("failed to create alert", error);
        const errorMessage = error instanceof Error ? error.message : "failed to create alert";
        return json({ error: errorMessage }, 500);
      }
    }

    return json({ error: "method not allowed" }, 405);
  }

  if (segments.length === 1) {
    const id = segments[0];

    if (request.method === "GET") {
      const alert = await getAlert(env, id);
      if (!alert) {
        return json({ error: "alert not found" }, 404);
      }
      return json(alert);
    }

    if (request.method === "PUT") {
      const payload = await readBody(request, logger);
      if (!payload) {
        return json({ error: "invalid JSON payload" }, 400);
      }

      const validation = validateAlertUpdate(payload);
      if (!validation.ok) {
        return json({ error: validation.errors.join(", ") }, 400);
      }

      try {
        const updated = await updateAlert(env, id, validation.data);
        if (!updated) {
          return json({ error: "alert not found" }, 404);
        }
        logger.info("Updated alert", { alertId: id });
        return json(updated);
      } catch (error) {
        logger.error("failed to update alert", error, { alertId: id });
        const errorMessage = error instanceof Error ? error.message : "failed to update alert";
        return json({ error: errorMessage }, 500);
      }
    }

    if (request.method === "DELETE") {
      const deleted = await deleteAlert(env, id);
      if (!deleted) {
        return json({ error: "alert not found" }, 404);
      }

      if (env.alertsKv) {
        await deleteAlertState(env.alertsKv, id);
      }

      return json({ success: true }, 200);
    }
  }

  return json({ error: "Not Found" }, 404);
}
