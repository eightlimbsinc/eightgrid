import { z } from "zod";
import { db } from "@/db";
import type { ViewConfig } from "@/lib/types";
import { requireUser, requireView } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { deleteView, updateView } from "@/server/schema-service";
import { toTable, toView } from "@/server/serialize";

type P = { viewId: string };

const patch = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<P>(async (req, { viewId }) => {
  const user = await requireUser();
  const { view, table } = await requireView(user.id, viewId, "creator");
  const input = patch.parse(await readJson(req));
  const updated = await updateView(
    db,
    toTable(table),
    toView(view),
    { name: input.name, config: input.config as ViewConfig | undefined },
    { userId: user.id, clientId: clientIdOf(req) },
  );
  return { view: updated };
});

export const DELETE = route<P>(async (req, { viewId }) => {
  const user = await requireUser();
  const { view, table } = await requireView(user.id, viewId, "creator");
  await deleteView(db, toTable(table), toView(view), { userId: user.id, clientId: clientIdOf(req) });
  return { ok: true };
});
