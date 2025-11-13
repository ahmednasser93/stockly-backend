import type { Env } from "../index";

const defaultUser = "stockly";
const defaultPass = "dashboard";

function unauthorized(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="Stockly Docs"',
    },
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    return false;
  }

  const token = header.slice("Basic ".length);
  try {
    const decoded = atob(token);
    const [user, pass] = decoded.split(":");
    const expectedUser = env.DOCS_USER ?? defaultUser;
    const expectedPass = env.DOCS_PASS ?? defaultPass;
    return user === expectedUser && pass === expectedPass;
  } catch {
    return false;
  }
}

export async function serveDocs(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const subPath = url.pathname.replace(/^\/docs/, "") || "/";

  if (subPath === "/auth-check") {
    return new Response(null, { status: 204 });
  }

  const assetPath = subPath === "/" ? "/endpoints.html" : subPath;
  const assetUrl = new URL(assetPath, request.url);
  return env.DOCS_ASSETS.fetch(
    new Request(assetUrl.toString(), {
      method: request.method,
      headers: request.headers,
    })
  );
}
