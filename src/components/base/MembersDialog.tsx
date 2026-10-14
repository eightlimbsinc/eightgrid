"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { api } from "@/client/api";
import { ROLE_DESCRIPTIONS, ROLES, type Role } from "@/lib/types";
import { Avatar, Modal, toast, toastError } from "../ui";
import { useBase } from "./context";

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <select
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[13px] capitalize disabled:bg-transparent disabled:border-transparent"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
          {r}
        </option>
      ))}
    </select>
  );
}

export function MembersDialog({ onClose }: { onClose: () => void }) {
  const { base, isOwner, reloadBase, confirm } = useBase();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reloadBase();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal title={`Share "${base.name}"`} onClose={onClose} width={560}>
      <div className="p-5">
        {isOwner ? (
          <form
            className="mb-5 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              await run(async () => {
                const r = await api<{ pending: boolean }>(`/api/bases/${base.id}/members`, { body: { email, role } });
                toast(r.pending ? `Invited ${email}. They'll get access when they sign up.` : `Added ${email}`);
                setEmail("");
              });
              setBusy(false);
            }}
          >
            <input
              className="input"
              type="email"
              placeholder="Invite by email…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <RoleSelect value={role} onChange={setRole} />
            <button className="btn-primary shrink-0" disabled={busy}>
              Invite
            </button>
          </form>
        ) : (
          <p className="mb-4 rounded-md bg-gray-50 px-3 py-2 text-gray-600">Only owners can invite people or change access.</p>
        )}
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">People with access</div>
        <ul className="divide-y divide-gray-100">
          {base.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2">
              <Avatar name={m.name} image={m.image} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.name}</div>
                <div className="truncate text-xs text-gray-500">{m.email}</div>
              </div>
              <RoleSelect
                value={m.role}
                disabled={!isOwner}
                onChange={(r) =>
                  run(() => api(`/api/bases/${base.id}/members`, { method: "PATCH", body: { userId: m.userId, role: r } }))
                }
              />
              {isOwner && (
                <button
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove"
                  onClick={async () => {
                    if (!(await confirm(`Remove ${m.name} from this base?`, { confirmLabel: "Remove" }))) return;
                    run(() => api(`/api/bases/${base.id}/members?userId=${m.userId}`, { method: "DELETE" }));
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
          {base.invites.map((i) => (
            <li key={i.email} className="flex items-center gap-3 py-2">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Mail size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.email}</div>
                <div className="text-xs text-gray-500">Invite pending — joins on sign-up</div>
              </div>
              <RoleSelect
                value={i.role}
                disabled={!isOwner}
                onChange={(r) =>
                  run(() => api(`/api/bases/${base.id}/members`, { method: "PATCH", body: { email: i.email, role: r } }))
                }
              />
              {isOwner && (
                <button
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Cancel invite"
                  onClick={() =>
                    run(() => api(`/api/bases/${base.id}/members?email=${encodeURIComponent(i.email)}`, { method: "DELETE" }))
                  }
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
          {ROLES.map((r) => (
            <div key={r}>
              <span className="font-medium capitalize text-gray-800">{r}:</span> {ROLE_DESCRIPTIONS[r]}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
