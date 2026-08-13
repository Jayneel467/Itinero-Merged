/**
 * Native share / clipboard for destination & package acquisition loops.
 */
export async function shareItineroLink({ title, text, url, image }) {
  const fullUrl = url?.startsWith("http")
    ? url
    : `${typeof window !== "undefined" ? window.location.origin : "https://itinero.company"}${url || ""}`;

  if (typeof document !== "undefined" && title) {
    document.title = title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    if (image) {
      let ogImg = document.querySelector('meta[property="og:image"]');
      if (!ogImg) {
        ogImg = document.createElement("meta");
        ogImg.setAttribute("property", "og:image");
        document.head.appendChild(ogImg);
      }
      ogImg.setAttribute("content", image);
    }
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url: fullUrl });
      return { ok: true, method: "native" };
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(fullUrl);
    return { ok: true, method: "clipboard" };
  } catch {
    return { ok: false };
  }
}

export function referralShareUrl(code) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://itinero.company";
  return `${base}/go/welcome?ref=${encodeURIComponent(code || "")}&utm_source=referral&utm_medium=share`;
}
