import {
  $Database,
  $Env,
  OpenApiExtension,
  PocketUIExtension,
  D1Adapter,
  teenyHono,
} from "teenybase/worker";
import config from "virtual:teenybase";

type Env = $Env & { Bindings: CloudflareBindings };
type Bindings = CloudflareBindings & { TB_SHARED_SECRET?: string };

const app = teenyHono<Env>(async (c) => {
  const db = new $Database(c, config, new D1Adapter(c.env.PRIMARY_DB));
  db.extensions.push(new OpenApiExtension(db, true), new PocketUIExtension(db));
  return db;
});

// Constant-time comparison (length still leaks; fine for a shared-secret header).
function keyMatches(provided: string | null, expected: string): boolean {
  if (provided === null || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// When TB_SHARED_SECRET is set (prod), every request must carry a matching
// X-TB-Key header. tbFetch (frontend server routes) and the ETL client already
// send it. Unset (local dev) => guard is inert.
export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext): Response | Promise<Response> {
    const secret = env.TB_SHARED_SECRET;
    if (secret && !keyMatches(request.headers.get("X-TB-Key"), secret)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return app.fetch(request, env, ctx);
  },
};
