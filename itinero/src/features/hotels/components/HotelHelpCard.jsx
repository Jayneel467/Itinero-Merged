import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert, MessageCircle, Mail, LifeBuoy } from "lucide-react";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { LEGAL, supportMailto } from "@/constants/legal";
import styles from "../HotelDetailPage.module.css";

export default function HotelHelpCard() {
  const navigate = useNavigate();
  const vero = useVeroUiOptional();

  const askVero = () => {
    if (vero?.openVero) {
      vero.openVero({
        prompt:
          "I need help with this hotel. Ask what’s wrong and guide me using the stay on the left - don’t invent hotel policy or pretend you called the property.",
        forceNew: true,
        source: "hotel_help_card",
        intent: "support",
      });
      return;
    }
    navigate("/help");
  };

  return (
    <div className={styles.HotelHelpCard_card}>
      <div className={styles.HotelHelpCard_header}>
        <div className={styles.HotelHelpCard_iconWrapper}>
          <ShieldAlert size={20} className={styles.HotelHelpCard_shieldIcon} />
        </div>
        <div className={styles.HotelHelpCard_headerText}>
          <h3 className={styles.HotelHelpCard_title}>Need help?</h3>
          <p className={styles.HotelHelpCard_subtitle}>
            Vero first · email {LEGAL.supportHours.split(",")[0]}
          </p>
        </div>
      </div>

      <div className={styles.HotelHelpCard_contactLinks}>
        <button type="button" className={styles.HotelHelpCard_linkBtn} onClick={askVero}>
          <MessageCircle size={14} />
          Ask Vero
        </button>
        <div className={styles.HotelHelpCard_divider} />
        <a
          className={styles.HotelHelpCard_linkBtn}
          href={supportMailto({
            subject: "Hotel booking help",
            body: "Hotel / booking id:\nCheck-in:\nIssue:\n",
          })}
        >
          <Mail size={14} />
          Email
        </a>
        <div className={styles.HotelHelpCard_divider} />
        <Link to="/help" className={styles.HotelHelpCard_linkBtn}>
          <LifeBuoy size={14} />
          Help centre
        </Link>
      </div>
    </div>
  );
}
