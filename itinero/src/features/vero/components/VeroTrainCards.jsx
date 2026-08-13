import React, { useState } from "react";
import { Train } from "lucide-react";
import "@/features/vero/VeroPage.css";

const PREVIEW_COUNT = 4;

export default function VeroTrainCards({ trains, cards }) {
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(trains)
    ? trains
    : Array.isArray(cards?.items)
      ? cards.items
      : [];
  const items = list.filter((t) => t && (t.number || t.name));
  if (!items.length) return null;

  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const hidden = Math.max(0, items.length - PREVIEW_COUNT);
  const title = cards?.title || "Trains";
  const subtitle = cards?.subtitle || "";

  return (
    <div className="vero-trains">
      <div className="vero-trains__head">
        <Train size={16} color="#f97211" aria-hidden />
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      </div>
      <ul className="vero-trains__list">
        {visible.map((train, i) => (
          <li key={`${train.number}-${train.dep}-${i}`} className="vero-train-card">
            <div className="vero-train-card__top">
              <div className="vero-train-card__id">
                <em>{train.number || "-"}</em>
                <strong>{train.name || "Train"}</strong>
              </div>
              {train.in_window === false ? (
                <span className="vero-train-card__badge">Nearby</span>
              ) : train.kind ? (
                <span className="vero-train-card__badge vero-train-card__badge--kind">
                  {train.kind}
                </span>
              ) : null}
            </div>
            <div className="vero-train-card__row">
              <div>
                <b>{train.dep || "-"}</b>
                <span>{train.from_code || ""}</span>
              </div>
              <div className="vero-train-card__mid">
                <em>{train.duration || ""}</em>
                <i />
              </div>
              <div>
                <b>{train.arr || "-"}</b>
                <span>{train.to_code || ""}</span>
              </div>
            </div>
            {train.days ? <p className="vero-train-card__days">{train.days}</p> : null}
            <div className="vero-train-card__actions">
              {train.irctc_url ? (
                <a href={train.irctc_url} target="_blank" rel="noopener noreferrer">
                  Book ticket
                </a>
              ) : null}
              {train.erail_url ? (
                <a
                  className="is-ghost"
                  href={train.erail_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Timetable
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className="vero-trains__more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `View ${hidden} more`}
        </button>
      )}
    </div>
  );
}
