import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, msg);

type Handler<P> = (req: Request, params: P) => Promise<unknown>;

/** Wrap a route handler with JSON serialization and error handling. */
export function route<P = Record<string, string>>(fn: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const params = await ctx.params;
      const result = await fn(req, params);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const msg = issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request";
    return Response.json({ error: msg }, { status: 400 });
  }
  console.error(e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  // Requiring a JSON content type means browsers must preflight cross-site requests (CSRF defense).
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  try {
    return await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
}

export function clientIdOf(req: Request): string | null {
  return req.headers.get("x-client-id");
}
