/**
 * The panel's two HTTP routes and their request hygiene.
 *
 * Every handler asks the composition's `connection` service for a rejection FIRST: that is the
 * Host/Origin + login-token fence which defeats DNS rebinding and cross-site calls. The control
 * body is bounded and must be application/json, because a hostile page must not be able to
 * reconfigure the reviewer even if it reaches the route.
 */
import { MAX_BODY_BYTES, STATE_ROUTE, TOGGLE_ROUTE } from "./config.js";
import { bindSession, stateSnapshot } from "./state.js";
import type { ReviewerConfig, ReviewerScope } from "./config.js";
import type { ReviewerState } from "./state.js";
import type { ConnectionService, HostContext, IncomingMessage, ServerResponse } from "./types.js";

/** The composition's connection fence: undefined lets the request through. */
function rejectionOf(ctx: HostContext, req: IncomingMessage): number | undefined {
  const connection = ctx.get("connection") as ConnectionService | undefined;
  if (
    connection === undefined ||
    connection === null ||
    typeof connection.requestRejection !== "function"
  )
    return undefined;
  return connection.requestRejection(req);
}

/** JSON response (no-store: review counts and decisions are live facts). */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(res: ServerResponse, allow: string): void {
  res.statusCode = 405;
  res.setHeader("allow", allow);
  res.end();
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling (stream drained). */
async function readBoundedBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

export function registerPanelRoutes(
  ctx: HostContext,
  state: ReviewerState,
  config: ReviewerConfig,
): void {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: STATE_ROUTE,
        handler: async (req, res) => {
          const rejection = rejectionOf(ctx, req);
          if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
          }
          if (req.method !== "GET") {
            sendMethodNotAllowed(res, "GET");
            return;
          }
          bindSession(
            state,
            new URL(String(req.url), "http://localhost").searchParams.get("sessionId"),
          );
          sendJson(res, 200, stateSnapshot(state, config));
        },
      }),
    "approve-for-me: GET " + STATE_ROUTE,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: TOGGLE_ROUTE,
        handler: async (req, res) => {
          const rejection = rejectionOf(ctx, req);
          if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
          }
          if (req.method !== "POST") {
            sendMethodNotAllowed(res, "POST");
            return;
          }
          if (
            String(req.headers["content-type"]).split(";", 1)[0].trim().toLowerCase() !==
            "application/json"
          ) {
            sendJson(res, 415, {
              code: "unsupported-media-type",
              message: "content-type must be application/json",
            });
            return;
          }
          let text: string | null;
          try {
            text = await readBoundedBody(req);
          } catch {
            sendJson(res, 400, { code: "bad-request", message: "request body unreadable" });
            return;
          }
          if (text === null) {
            sendJson(res, 413, { code: "payload-too-large", message: "request body is too large" });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            sendJson(res, 400, {
              code: "bad-request",
              message: "request body must be a JSON object",
            });
            return;
          }
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            sendJson(res, 400, {
              code: "bad-request",
              message: "request body must be a JSON object",
            });
            return;
          }
          const body = parsed as { enabled?: unknown; dryRun?: unknown; scope?: unknown };
          if (typeof body.enabled === "boolean") state.enabled = body.enabled;
          if (typeof body.dryRun === "boolean") config.dryRun = body.dryRun;
          if (body.scope === "session" || body.scope === "all")
            config.scope = body.scope satisfies ReviewerScope;
          sendJson(res, 200, {
            enabled: state.enabled,
            dryRun: config.dryRun === true,
            scope: config.scope,
          });
        },
      }),
    "approve-for-me: POST " + TOGGLE_ROUTE,
  );
}
