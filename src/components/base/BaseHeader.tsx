"use client";

import Link from "next/link";
import { useState } from "react";
import { Code2, Share2 } from "lucide-react";
import { api } from "@/client/api";
import { BASE_COLORS } from "@/lib/colors";
import { UserMenu } from "../AppHeader";
import { Logo } from "../Logo";
import { Avatar, toastError } from "../ui";
import { useBase } from "./context";
import { MembersDialog } from "./MembersDialog";
import { ApiInfoDialog } from "./ApiInfoDialog";

export function BaseHeader({ user }: { user: { name: string; email: string } }) {
  const { base, canSchema, reloadBase } = useBase();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(base.name);
  const [sharing, setSharing] = useState(false);
  const [apiInfo, setApiInfo] = useState(false);
  const color = BASE_COLORS[base.color] ?? BASE_COLORS.blue;

  const save = async () => {
    setEditing(false);
    if (!name.trim() || name === base.name) return setName(base.name);
    try {
      await api(`/api/bases/${base.id}`, { method: "PATCH", body: { name: name.trim() } });
      await reloadBase();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 px-3 text-white" style={{ background: color }}>
      <Link href="/" className="rounded p-1 hover:bg-white/15" title="All bases">
        <Logo light size={26} />
      </Link>
      {editing ? (
        <input
          autoFocus
          className="rounded bg-white/20 px-2 py-1 text-[15px] font-semibold text-white outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(base.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="truncate rounded px-2 py-1 text-[15px] font-semibold hover:bg-white/15 disabled:hover:bg-transparent"
          disabled={!canSchema}
          onClick={() => {
            setName(base.name);
            setEditing(true);
          }}
        >
          {base.name}
        </button>
      )}
      <div className="flex-1" />
      <div className="hidden items-center -space-x-1.5 sm:flex">
        {base.members.slice(0, 5).map((m) => (
          <span key={m.userId} className="rounded-full ring-2 ring-white/40">
            <Avatar name={m.name} image={m.image} size={24} />
          </span>
        ))}
      </div>
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-white/15" onClick={() => setApiInfo(true)}>
        <Code2 size={15} /> <span className="hidden sm:inline">API</span>
      </button>
      <button
        className="flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30"
        onClick={() => setSharing(true)}
      >
        <Share2 size={14} /> Share
      </button>
      <UserMenu user={user} />
      {sharing && <MembersDialog onClose={() => setSharing(false)} />}
      {apiInfo && <ApiInfoDialog onClose={() => setApiInfo(false)} />}
    </header>
  );
}
