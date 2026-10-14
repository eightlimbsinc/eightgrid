"use client";

import { createContext, useContext } from "react";
import type { Resolver } from "@/client/display";
import type { BasePayload, Field, Table, View, ViewConfig } from "@/lib/types";

export interface BaseCtx {
  base: BasePayload;
  resolver: Resolver;
  table: Table;
  view: View;
  /** all fields of the current table */
  fields: Field[];
  canSchema: boolean;
  canEdit: boolean;
  canComment: boolean;
  isOwner: boolean;
  search: string;
  setSearch: (s: string) => void;
  reloadBase: () => Promise<void>;
  selectTable: (tableId: string) => void;
  selectView: (viewId: string) => void;
  /** Merge into the view config; saved for creators, session-only for others. */
  patchView: (config: Partial<ViewConfig>) => void;
  openRecord: (tableId: string, recordId: string, ids?: string[]) => void;
  confirm: (message: string, opts?: { danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
}

export const BaseContext = createContext<BaseCtx | null>(null);

export function useBase(): BaseCtx {
  const ctx = useContext(BaseContext);
  if (!ctx) throw new Error("useBase outside BaseApp");
  return ctx;
}
