import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Page not found
        </h1>
        <p style={{ color: "#666", marginBottom: "1.25rem" }}>
          That route doesn&apos;t exist.
        </p>
        <Link href="/" style={{ color: "#0f766e", fontWeight: 600 }}>
          Back to Itinero home
        </Link>
      </div>
    </main>
  );
}
