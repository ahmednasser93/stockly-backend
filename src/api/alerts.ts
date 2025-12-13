import { json } from "../util";
import type { Env } from "../index";
import { createAlert, deleteAlert, getAlert, listAlerts, updateAlert } from "../alerts/storage";
import { deleteAlertState } from "../alerts/state";
import { validateAlertUpdate, validateNewAlert } from "../alerts/validation";
import { authenticateRequestWithAdmin } from "../auth/middleware";
import { createErrorResponse } from "../auth/error-handler";
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
  // Authenticate request to get userId and admin status
  const auth = await authenticateRequestWithAdmin(
    request,
    env,
    env.JWT_SECRET || "",
    env.JWT_REFRESH_SECRET
  );

  if (!auth) {
    const { response } = createErrorResponse(
      "AUTH_MISSING_TOKEN",
      "Authentication required",
      undefined,
      undefined,
      request
    );
    return response;
  }

  // For admin, pass null to get all data; otherwise use userId
  const userId = auth.isAdmin ? null : auth.userId;

  const url = new URL(request.url);
  const tail = url.pathname.slice(ALERT_PREFIX.length);
  const segments = tail.split("/").filter(Boolean);

  if (!segments.length) {
    if (request.method === "GET") {
      const alerts = await listAlerts(env, userId);
      logger.info("Fetched alerts from D1", { userId });
      return json({ alerts }, 200, request);
    }

    if (request.method === "POST") {
      const payload = await readBody(request, logger);
      if (!payload) {
        return json({ error: "invalid JSON payload" }, 400, request);
      }
      const validation = validateNewAlert(payload);
      if (!validation.ok) {
        return json({ error: validation.errors.join(", ") }, 400, request);
      }

      try {
        // Admin can create alerts, but we still need a userId for the alert
        // Use the admin's userId for creation
        const alertUserId = auth.isAdmin ? auth.userId : userId;
        const alert = await createAlert(env, validation.data, alertUserId);
        logger.info("Created alert", { alertId: alert.id, userId: alertUserId, isAdmin: auth.isAdmin });
        return json(alert, 201, request);
      } catch (error) {
        logger.error("failed to create alert", error, { userId });
        const errorMessage = error instanceof Error ? error.message : "failed to create alert";
        return json({ error: errorMessage }, 500, request);
      }
    }

    return json({ error: "method not allowed" }, 405, request);
  }

  if (segments.length === 1) {
    const id = segments[0];

    if (request.method === "GET") {
      const alert = await getAlert(env, id, userId);
      if (!alert) {
        return json({ error: "alert not found" }, 404, request);
      }
      return json(alert, 200, request);
    }

    if (request.method === "PUT") {
      const payload = await readBody(request, logger);
      if (!payload) {
        return json({ error: "invalid JSON payload" }, 400, request);
      }

      const validation = validateAlertUpdate(payload);
      if (!validation.ok) {
        return json({ error: validation.errors.join(", ") }, 400, request);
      }

      try {
        const updated = await updateAlert(env, id, validation.data, userId);
        if (!updated) {
          return json({ error: "alert not found" }, 404, request);
        }
        logger.info("Updated alert", { alertId: id, userId });
        return json(updated, 200, request);
      } catch (error) {
        logger.error("failed to update alert", error, { alertId: id, userId });
        const errorMessage = error instanceof Error ? error.message : "failed to update alert";
        return json({ error: errorMessage }, 500, request);
      }
    }

    if (request.method === "DELETE") {
      const deleted = await deleteAlert(env, id, userId);
      if (!deleted) {
        return json({ error: "alert not found" }, 404, request);
      }

      if (env.alertsKv) {
        await deleteAlertState(env.alertsKv, id);
      }

      logger.info("Deleted alert", { alertId: id, userId });
      return json({ success: true }, 200, request);
    }
  }

  return json({ error: "Not Found" }, 404, request);
}
