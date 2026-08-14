import { useVeroUiOptional } from "@/context/VeroUiContext";
import styles from "./VeroPostBookingHelp.module.css";

/**
 * Companion CTA on confirmation screens. Vero stays free; this never paywalls chat.
 */
export default function VeroPostBookingHelp({
  prompt,
  title = "Need help? Ask Vero",
  copy = "Ask confirmation, cancel, or the next move on this booking — not a new search.",
}) {
  const vero = useVeroUiOptional();
  if (!vero?.openVero || !prompt) return null;
  const veroSrc = `${import.meta.env.BASE_URL}vero-chatbot.png`;

  return (
    <div className={styles.wrap}>
      <img src={veroSrc} alt="" className={styles.face} />
      <div className={styles.copy}>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <button type="button" className={styles.btn} onClick={() => vero.openVero(prompt)}>
        Ask Vero
      </button>
    </div>
  );
}
