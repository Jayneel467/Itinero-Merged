"use client";

import Link from "next/link";

type AuthControlsProps = {
  compact?: boolean;
};

/** Demo stub - Clerk temporarily disabled so local testing works. */
export function AuthControls({ compact = false }: AuthControlsProps) {
  return (
    <Link
      href="/account"
      className={
        compact
          ? "rounded-[50px] border border-[#E8EDF2] px-3 py-1.5 text-[12px] font-semibold text-navy hover:border-[#F97211]"
          : "rounded-[50px] border border-[#E8EDF2] px-4 py-2 text-[13px] font-semibold text-navy hover:border-[#F97211]"
      }
    >
      Account
    </Link>
  );
}
