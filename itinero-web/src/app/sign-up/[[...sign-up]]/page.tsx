import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--gradient-warm)] px-4 py-12">
      <h1 className="text-2xl font-black text-navy">Sign up</h1>
      <p className="max-w-md text-center text-muted">
        Clerk sign-up is temporarily disabled for local testing.
      </p>
      <Link href="/" className="btn-primary px-5 py-2.5 text-sm font-bold">
        Back home
      </Link>
    </main>
  );
}
