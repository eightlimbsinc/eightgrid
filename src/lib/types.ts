export type FieldType =
  | "text"
  | "longText"
  | "number"
  | "currency"
  | "percent"
  | "checkbox"
  | "singleSelect"
  | "multiSelect"
  | "date"
  | "email"
  | "url"
  | "phone"
  | "rating"
  | "link"
  | "attachment"
  | "user"
  | "formula"
  | "createdTime"
  | "lastModifiedTime"
  | "createdBy"
  | "lastModifiedBy";

export interface Choice {
  id: string;
  name: string;
  color: string;
}

export interface FieldOptions {
  /** number / currency / percent / formula */
  precision?: number;
  /** currency */
  symbol?: string;
  /** singleSelect / multiSelect */
  choices?: Choice[];
  /** date */
  includeTime?: boolean;
  /** rating */
  max?: number;
  /** link */
  linkedTableId?: string;
  inverseFieldId?: string;
  /** formula, stored with {fldXXX} references */
  formula?: string;
}

export interface Field {
  id: string;
  tableId: string;
  name: string;
  type: FieldType;
  options: FieldOptions;
  description: string;
  position: number;
}

export interface Table {
  id: string;
  baseId: string;
  name: string;
  position: number;
  primaryFieldId: string;
}

export type ViewType = "grid" | "kanban" | "calendar" | "gallery" | "form";

export type FilterOp =
  | "contains"
  | "notContains"
  | "is"
  | "isNot"
  | "isEmpty"
  | "isNotEmpty"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "isAnyOf"
  | "isNoneOf"
  | "hasAnyOf"
  | "hasAllOf"
  | "isBefore"
  | "isAfter";

export interface FilterCondition {
  id: string;
  fieldId: string;
  op: FilterOp;
  value?: unknown;
}

export interface FilterSet {
  conjunction: "and" | "or";
  conditions: FilterCondition[];
}

export interface SortSpec {
  fieldId: string;
  direction: "asc" | "desc";
}

export interface FormConfig {
  title?: string;
  description?: string;
  fieldIds?: string[];
  required?: string[];
  public?: boolean;
  submitMessage?: string;
}

export interface ViewConfig {
  filters?: FilterSet;
  sorts?: SortSpec[];
  groups?: SortSpec[];
  hiddenFieldIds?: string[];
  fieldOrder?: string[];
  fieldWidths?: Record<string, number>;
  kanbanFieldId?: string;
  calendarFieldId?: string;
  coverFieldId?: string;
  form?: FormConfig;
}

export interface View {
  id: string;
  tableId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: number;
}

export interface RecordRow {
  id: string;
  tableId: string;
  data: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export type Role = "owner" | "creator" | "editor" | "commenter" | "viewer";

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  creator: 3,
  owner: 4,
};

export const ROLES: Role[] = ["owner", "creator", "editor", "commenter", "viewer"];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including members and deleting the base",
  creator: "Edit tables, fields, views and records",
  editor: "Edit records, but not the structure",
  commenter: "View and comment",
  viewer: "Read-only",
};

export function hasRole(role: Role | null | undefined, min: Role): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

export interface Invite {
  email: string;
  role: Role;
}

export interface BasePayload {
  id: string;
  name: string;
  color: string;
  role: Role;
  tables: Table[];
  fields: Field[];
  views: View[];
  members: Member[];
  invites: Invite[];
  latestSeq: number;
}

export interface Comment {
  id: string;
  recordId: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

export interface ActivityEntry {
  seq: number;
  kind: string;
  actorId: string | null;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
