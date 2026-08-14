/**
 * Strip inventory / GDS / partner brand names from traveller-facing copy.
 * Internal field names (liteapi: {…}) stay in payloads — this is display only.
 */

const REPLACEMENTS = [
  [/LiteAPI\s*Payment\s*SDK/gi, "secure card checkout"],
  [/Lite\s*API\s*Payment\s*SDK/gi, "secure card checkout"],
  [/payment-wrapper\.liteapi\.travel/gi, "the payment page"],
  [/\bLiteAPIError:\s*/gi, ""],
  [/\bvia Lite\s*API\b/gi, ""],
  [/\bfrom Lite\s*API\b/gi, ""],
  [/\bon Lite\s*API\b/gi, ""],
  [/\bLite\s*API\b/gi, ""],
  [/\bNuitee(?:\s+Connect)?\b/gi, ""],
  [/\bNuitée\b/gi, ""],
  [/\beSimply\b/gi, "eSIM"],
  [/\bTicketmaster\b/gi, "the ticket seller"],
  [/\bRailYatri\b/gi, "partner checkout"],
  [/\beRail\b/gi, "train times"],
  [/\bredBus\b/gi, "partner checkout"],
  [/\bAbhiBus\b/gi, "partner checkout"],
  [/\bIntrCity\b/gi, "partner checkout"],
  [/\bConfirmTkt\b/gi, ""],
  [/\bFrankfurter\b/gi, "mid-market"],
  [/\bDeepSeek\b/g, ""],
  [/\bOpenAI\b/g, ""],
];

export function scrubProviderCopy(text) {
  if (text == null) return "";
  let out = String(text);
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/[^\S\n]{2,}/g, " ");
  out = out.replace(/\s+([,.])/g, "$1");
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}
