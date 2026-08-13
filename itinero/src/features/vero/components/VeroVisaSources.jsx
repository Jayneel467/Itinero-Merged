import React from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import styles from "./VeroVisaSources.module.css";

export default function VeroVisaSources({ cards }) {
  const items = Array.isArray(cards?.items)
    ? cards.items.filter((x) => x && (x.url || x.website_url))
    : [];
  if (!items.length) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <ShieldCheck size={15} color="#F97211" />
        <div>
          <div className={styles.title}>{cards.title || "Official sources"}</div>
          {cards.subtitle ? <div className={styles.sub}>{cards.subtitle}</div> : null}
        </div>
      </div>
      <ul className={styles.list}>
        {items.map((item, i) => {
          const href = item.url || item.website_url;
          const level = item.level != null ? `L${item.level}` : "";
          return (
            <li key={`${href}-${i}`}>
              <a
                className={styles.link}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.name}>
                  {item.title || item.name || item.authority || "Official page"}
                </span>
                <span className={styles.meta}>
                  {level ? <em>{level}</em> : null}
                  <ExternalLink size={14} />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>
        Border and airline authorities make the final determination.
      </p>
    </div>
  );
}
