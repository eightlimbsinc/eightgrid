"use client";

import Link from "next/link";
import { BookOpen, KeyRound, LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { Logo } from "./Logo";
import { Avatar, PopoverButton } from "./ui";

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  return (
    <PopoverButton
      className="rounded-full"
      align="right"
      button={<Avatar name={user.name} size={28} />}
    >
      {() => (
        <div className="w-60 p-1">
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="font-medium">{user.name}</div>
            <div className="truncate text-xs text-gray-500">{user.email}</div>
          </div>
          <Link href="/account" className="menu-item mt-1">
            <KeyRound size={14} className="text-gray-500" /> Account & API tokens
          </Link>
          <Link href="/docs/api" className="menu-item">
            <BookOpen size={14} className="text-gray-500" /> API documentation
          </Link>
          <form action={logoutAction}>
            <button className="menu-item">
              <LogOut size={14} className="text-gray-500" /> Sign out
            </button>
          </form>
        </div>
      )}
    </PopoverButton>
  );
}

export function AppHeader({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-5">
      <Link href="/">
        <Logo withText size={28} />
      </Link>
      <UserMenu user={user} />
    </header>
  );
}
