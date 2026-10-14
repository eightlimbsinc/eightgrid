import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isComputed, isEmptyValue, coerceValue } from "@/lib/fields";
import { hasRole, type Field } from "@/lib/types";
import { currentUser, getRole } from "@/server/access";
import { primaryNames } from "@/server/display";
import { badRequest, HttpError, notFound, readJson, route } from "@/server/http";
import { createRecords, tableFields } from "@/server/records";
import { toTable, toView } from "@/server/serialize";

type P = { viewId: string };

async function loadForm(viewId: string) {
  const [row] = await db.select().from(schema.views).where(eq(schema.views.id, viewId));
  if (!row || row.type !== "form") throw notFound("Form not found");
  const view = toView(row);
  const [tableRow] = await db.select().from(schema.tables).where(eq(schema.tables.id, view.tableId));
  const table = toTable(tableRow);
  const form = view.config.form ?? {};
  const user = await currentUser();
  if (!form.public) {
    if (!user) throw new HttpError(401, "Sign in to fill out this form");
    const role = await getRole(user.id, table.baseId);
    if (!hasRole(role, "editor")) throw notFound("Form not found");
  }
  const all = await tableFields(db, table.id);
  const fields = (form.fieldIds ?? [])
    .map((id) => all.find((f) => f.id === id))
    .filter((f): f is Field => !!f && !isComputed(f.type));
  return { view, table, form, fields, user };
}

export const GET = route<P>(async (_req, { viewId }) => {
  const { form, fields, table } = await loadForm(viewId);
  const linkOptions: Record<string, { id: string; name: string }[]> = {};
  for (const f of fields) {
    if (f.type === "link" && f.options.linkedTableId) {
      const names = await primaryNames(db, f.options.linkedTableId);
      linkOptions[f.id] = [...names].slice(0, 2000).map(([id, name]) => ({ id, name: name || "Unnamed record" }));
    }
  }
  return {
    title: form.title || table.name,
    description: form.description ?? "",
    submitMessage: form.submitMessage ?? "Thanks for submitting the form!",
    required: form.required ?? [],
    fields: fields.filter((f) => f.type !== "user"),
    linkOptions,
  };
});

export const POST = route<P>(async (req, { viewId }) => {
  const { form, fields, table, user } = await loadForm(viewId);
  const input = z.object({ fields: z.record(z.string(), z.unknown()) }).parse(await readJson(req));
  const allowed = new Map(fields.map((f) => [f.id, f]));
  const values: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(input.fields)) {
    const f = allowed.get(id);
    if (f && f.type !== "user") values[id] = v;
  }
  for (const id of form.required ?? []) {
    const f = allowed.get(id);
    if (f && isEmptyValue(coerceValue(f, values[id]))) throw badRequest(`"${f.name}" is required`);
  }
  const [record] = await db.transaction((tx) =>
    createRecords(tx, table, [{ fields: values }], { userId: user?.id ?? null, clientId: null }),
  );
  return { ok: true, id: record.id };
});
