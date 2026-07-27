import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <SiteHeader />
      <main className="mx-auto max-w-[640px] px-4 py-12">
        <h1 className="text-[28px] font-black text-navy">Account</h1>
        <p className="mt-2 text-muted">
          Sign-in is temporarily offline for local demo. Clerk will be
          re-enabled once dashboard URLs are set.
        </p>
        <ul className="mt-8 list-disc space-y-2 pl-5 text-[14px] text-muted">
          <li>
            <Link href="/ai" className="text-[#F97211]">
              Plan with AI
            </Link>
          </li>
          <li>
            <Link href="/book" className="text-[#F97211]">
              Manual booking
            </Link>
          </li>
        </ul>
      </main>
    </div>
  );
}
