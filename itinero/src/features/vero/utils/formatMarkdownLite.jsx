import React from "react";

/**
 * Lightweight markdown for Vero chat bubbles: **bold**, *italic*, links, bullets.
 */
export function formatMarkdownLite(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {listItems.map((item, i) => (
          <li key={i}>{formatInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${idx}`} style={{ height: 8 }} />);
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${idx}`} className="vero-md-h">
          {formatInline(heading[1])}
        </p>
      );
      return;
    }
    blocks.push(
      <p key={`p-${idx}`}>
        {formatInline(line)}
      </p>
    );
  });
  flushList();
  return <div className="vero-msg-md">{blocks}</div>;
}

function formatInline(text) {
  const parts = String(text).split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default formatMarkdownLite;
