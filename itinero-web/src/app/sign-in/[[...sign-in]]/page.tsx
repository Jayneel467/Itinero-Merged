import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--gradient-warm)] px-4 py-12">
      <h1 className="text-2xl font-black text-navy">Sign in</h1>
      <p className="max-w-md text-center text-muted">
        Clerk sign-in is temporarily disabled for local testing. You can use
        Manual booking and AI chat without an account.
      </p>
      <Link href="/" className="btn-primary px-5 py-2.5 text-sm font-bold">
        Back home
      </Link>
    </main>
  );
}
