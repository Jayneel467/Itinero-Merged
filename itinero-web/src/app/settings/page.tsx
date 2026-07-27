import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <SiteHeader />
      <main className="mx-auto max-w-[640px] px-4 py-12">
        <h1 className="text-[28px] font-black text-navy">Settings</h1>
        <p className="mt-2 text-muted">
          Preferences and API wiring. No secrets are stored in the browser.
        </p>
        <div className="mt-8 space-y-4 rounded-[20px] border border-[#E8EDF2] bg-white p-6">
          <div>
            <p className="text-[13px] font-semibold text-navy">Supervisor URL</p>
            <p className="mt-1 text-[14px] text-muted">
              Set <code className="text-[#F97211]">NEXT_PUBLIC_SUPERVISOR_URL</code>{" "}
              in <code>.env.local</code> (default{" "}
              <code>http://127.0.0.1:8000</code>).
            </p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-navy">Flows</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted">
              <li>
                <Link href="/book" className="text-[#F97211]">
                  Manual booking
                </Link>
              </li>
              <li>
                <Link href="/ai" className="text-[#F97211]">
                  AI supervisor
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
