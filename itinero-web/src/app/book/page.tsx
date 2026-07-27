import { Suspense } from "react";
import ManualBookClient from "./ManualBookClient";

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted">
          Loading booking…
        </div>
      }
    >
      <ManualBookClient />
    </Suspense>
  );
}
