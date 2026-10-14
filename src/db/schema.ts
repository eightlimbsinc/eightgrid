import {
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { FieldOptions, ViewConfig } from "@/lib/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: createdAt(),
});

export const bases = pgTable("bases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("blue"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const baseMembers = pgTable(
  "base_members",
  {
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.baseId, t.userId] }), index("base_members_user_idx").on(t.userId)],
);

export const baseInvites = pgTable(
  "base_invites",
  {
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.baseId, t.email] }), index("base_invites_email_idx").on(t.email)],
);

export const tables = pgTable(
  "tables",
  {
    id: text("id").primaryKey(),
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    primaryFieldId: text("primary_field_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("tables_base_idx").on(t.baseId)],
);

export const fields = pgTable(
  "fields",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    options: jsonb("options").$type<FieldOptions>().notNull().default({}),
    description: text("description").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("fields_table_idx").on(t.tableId)],
);

export const views = pgTable(
  "views",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config").$type<ViewConfig>().notNull().default({}),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("views_table_idx").on(t.tableId)],
);

export const records = pgTable(
  "records",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    position: doublePrecision("position").notNull().default(0),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("records_table_idx").on(t.tableId, t.position)],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_record_idx").on(t.recordId)],
);

/** Audit log + realtime change feed. Clients poll by base and `seq`. */
export const activity = pgTable(
  "activity",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    tableId: text("table_id"),
    recordId: text("record_id"),
    actorId: text("actor_id"),
    clientId: text("client_id"),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_base_seq_idx").on(t.baseId, t.seq), index("activity_record_idx").on(t.recordId)],
);

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});
