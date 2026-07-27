import { NextRequest, NextResponse } from "next/server";

export type UnsplashPhoto = {
  id: string;
  url: string;
  thumb: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
  query: string;
  source: "unsplash" | "fallback";
};

const FALLBACKS: Record<string, UnsplashPhoto> = {
  bali: {
    id: "fallback-bali",
    url: "/images/bali.png",
    thumb: "/images/bali.png",
    alt: "Bali",
    photographer: "Itinero",
    photographerUrl: "https://pixano.in/itinero/",
    unsplashUrl: "https://unsplash.com",
    query: "bali",
    source: "fallback",
  },
  "new york": {
    id: "fallback-nyc",
    url: "/images/newYork.png",
    thumb: "/images/newYork.png",
    alt: "New York",
    photographer: "Itinero",
    photographerUrl: "https://pixano.in/itinero/",
    unsplashUrl: "https://unsplash.com",
    query: "new york",
    source: "fallback",
  },
  darjeeling: {
    id: "fallback-darjeeling",
    url: "/images/darjeeling.png",
    thumb: "/images/darjeeling.png",
    alt: "Darjeeling",
    photographer: "Itinero",
    photographerUrl: "https://pixano.in/itinero/",
    unsplashUrl: "https://unsplash.com",
    query: "darjeeling",
    source: "fallback",
  },
  japan: {
    id: "fallback-japan",
    url: "/images/japan.png",
    thumb: "/images/japan.png",
    alt: "Japan",
    photographer: "Itinero",
    photographerUrl: "https://pixano.in/itinero/",
    unsplashUrl: "https://unsplash.com",
    query: "japan",
    source: "fallback",
  },
  travel: {
    id: "fallback-travel",
    url: "/images/japan.png",
    thumb: "/images/japan.png",
    alt: "Travel",
    photographer: "Itinero",
    photographerUrl: "https://pixano.in/itinero/",
    unsplashUrl: "https://unsplash.com",
    query: "travel",
    source: "fallback",
  },
};

function fallbackFor(query: string): UnsplashPhoto {
  const q = query.toLowerCase().trim();
  for (const [key, photo] of Object.entries(FALLBACKS)) {
    if (q.includes(key)) return { ...photo, query: q };
  }
  return { ...FALLBACKS.travel, query: q, alt: query };
}

/**
 * GET /api/unsplash?q=Bali
 * Hotlinks Unsplash images + returns attribution fields (guidelines-compliant).
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "travel destination").trim();
  const key = process.env.UNSPLASH_ACCESS_KEY;

  if (!key) {
    return NextResponse.json({ photo: fallbackFor(q), reason: "missing_key" });
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", `${q} travel destination`);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("orientation", "landscape");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({
        photo: fallbackFor(q),
        reason: `unsplash_${res.status}`,
      });
    }

    const data = await res.json();
    const hit = data?.results?.[0];
    if (!hit?.urls?.regular) {
      return NextResponse.json({ photo: fallbackFor(q), reason: "empty" });
    }

    // Unsplash guidelines: hotlink urls.*, attribute photographer, link back
    const photo: UnsplashPhoto = {
      id: hit.id,
      url: hit.urls.regular,
      thumb: hit.urls.small || hit.urls.thumb,
      alt: hit.alt_description || q,
      photographer: hit.user?.name || "Unsplash photographer",
      photographerUrl:
        hit.user?.links?.html
          ? `${hit.user.links.html}?utm_source=itinero&utm_medium=referral`
          : "https://unsplash.com/?utm_source=itinero&utm_medium=referral",
      unsplashUrl: hit.links?.html
        ? `${hit.links.html}?utm_source=itinero&utm_medium=referral`
        : "https://unsplash.com/?utm_source=itinero&utm_medium=referral",
      query: q,
      source: "unsplash",
    };

    return NextResponse.json({ photo });
  } catch {
    return NextResponse.json({ photo: fallbackFor(q), reason: "error" });
  }
}
