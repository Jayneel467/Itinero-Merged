import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CreditCard,
  Hotel,
  LifeBuoy,
  Mail,
  Plane,
  Receipt,
  TrainFront,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useVeroUi } from "@/context/VeroUiContext";
import { LEGAL, supportMailto } from "@/constants/legal";
import styles from "./HelpPage.module.css";

const TOPICS = [
  {
    id: "booking",
    title: "Booking",
    Icon: Receipt,
    prompt:
      "I have a booking issue. Help me check the confirmation and what to do next - without inventing booking facts.",
  },
  {
    id: "refund",
    title: "Refund",
    Icon: CreditCard,
    prompt:
      "I need help with a refund or fare change. Walk me through what I can do without inventing airline policy.",
  },
  {
    id: "flight",
    title: "Flight",
    Icon: Plane,
    prompt:
      "I have a flight problem. Help with the next move - delay, bags, or connection - without inventing live facts.",
  },
  {
    id: "hotel",
    title: "Hotel",
    Icon: Hotel,
    prompt:
      "I have a hotel problem. Help me fix check-in or the booking without pretending you called the hotel.",
  },
  {
    id: "train",
    title: "Train",
    Icon: TrainFront,
    prompt:
      "I need help with a train booking or PNR. Guide me using live tools where you can - don’t invent waitlist status.",
  },
  {
    id: "other",
    title: "Something else",
    Icon: LifeBuoy,
    prompt:
      "I need support. Ask what went wrong and help with the booking on the left if you can see it.",
  },
];

const FAQS = [
  {
    q: "Where is my confirmation?",
    a: "Open My Trips on this device, and check the email you used at checkout (including spam).",
  },
  {
    q: "How do refunds work?",
    a: "Refunds follow that ticket or stay’s fare rules - not a blanket Itinero promise. See Cancellation & refunds, then start from My Trips when cancel is available.",
  },
  {
    q: "Is support available 24/7 by phone?",
    a: `No. First line is Vero in-app. Email support runs ${LEGAL.supportHours}. ${LEGAL.supportSla}.`,
  },
  {
    q: "Will Vero invent gates or PNRs?",
    a: "No. Live facts only come from tools or your trip. If we don’t have it, we say so.",
  },
];

export default function HelpPage() {
  const { openVero, setPageContext, clearPageContext } = useVeroUi();
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    const topic = TOPICS.find((t) => t.id === activeId);
    setPageContext({
      screen: "help",
      help: {
        topic: topic?.id || null,
        topic_label: topic?.title || "Help",
      },
    });
    return () => clearPageContext();
  }, [activeId, setPageContext, clearPageContext]);

  const ask = (topic) => {
    setActiveId(topic?.id || null);
    openVero({
      prompt:
        topic?.prompt ||
        "I need help with my trip. Ask what’s wrong and open the right page on the left if needed.",
      forceNew: true,
      source: "help",
      topic: topic?.id || null,
      intent: "support",
    });
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <header className={styles.head}>
          <p className={styles.kicker}>Support</p>
          <h1 className={styles.title}>Help</h1>
          <p className={styles.lede}>
            Start with Vero for trip questions. For booking disputes or account issues, email
            us - we don’t run a 24/7 phone line.
          </p>
        </header>

        <button type="button" className={styles.primary} onClick={() => ask(null)}>
          Talk to Vero
        </button>

        <div className={styles.chips} role="group" aria-label="Help topics">
          {TOPICS.map((topic) => {
            const { Icon } = topic;
            return (
              <button
                key={topic.id}
                type="button"
                className={styles.chip}
                onClick={() => ask(topic)}
              >
                <Icon size={16} strokeWidth={2.2} aria-hidden />
                {topic.title}
              </button>
            );
          })}
        </div>

        <section className={styles.contact} aria-label="Email support">
          <h2>Email support</h2>
          <p>
            {LEGAL.supportHours}. {LEGAL.supportSla}.
          </p>
          <a
            className={styles.emailBtn}
            href={supportMailto({
              subject: "Itinero support",
              body: "Booking id (if any):\nWhat went wrong:\n",
            })}
          >
            <Mail size={16} strokeWidth={2.2} aria-hidden />
            {LEGAL.supportEmail}
          </a>
          <p className={styles.fine}>
            Include your booking id from My Trips. We won’t invent airline or hotel policy over
            email either.
          </p>
        </section>

        <p className={styles.hint}>
          Bookings live in <Link to="/trips">My Trips</Link>. Cancel rules in{" "}
          <Link to="/cancellation">Cancellation &amp; refunds</Link>. Product ideas in{" "}
          <Link to="/feedback">Feedback</Link>. Account in <Link to="/profile">Profile</Link>.
        </p>

        <section className={styles.faq} aria-label="Common questions">
          <h2>Quick answers</h2>
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
      </div>
    </PageLayout>
  );
}
