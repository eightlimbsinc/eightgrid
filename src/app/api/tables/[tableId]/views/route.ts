import { z } from "zod";
import { db } from "@/db";
import type { ViewConfig } from "@/lib/types";
import { requireTable, requireUser } from "@/server/access";
import { clientIdOf, readJson, route } from "@/server/http";
import { createView, VIEW_TYPES } from "@/server/schema-service";
import { toTable } from "@/server/serialize";

type P = { tableId: string };

const body = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.enum(VIEW_TYPES as [string, ...string[]]),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const POST = route<P>(async (req, { tableId }) => {
  const user = await requireUser();
  const { table } = await requireTable(user.id, tableId, "creator");
  const input = body.parse(await readJson(req));
  const view = await db.transaction((tx) =>
    createView(
      tx,
      toTable(table),
      input.name,
      input.type as (typeof VIEW_TYPES)[number],
      { userId: user.id, clientId: clientIdOf(req) },
      input.config as ViewConfig | undefined,
    ),
  );
  return { view };
});
