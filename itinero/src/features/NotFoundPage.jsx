import React from "react";
import { PageLayout } from "@/components/layout";
import { ActionButton, ActionRow } from "@/components/shared";
import styles from "./NotFoundPage.module.css";

export default function NotFoundPage() {
  return (
    <PageLayout>
      <section className={styles.wrap}>
        <div>
          <p className={styles.kicker}>404</p>
          <h1 className={styles.title}>Page not found</h1>
          <p className={styles.copy}>
            That route doesn’t exist. Head home or search flights and hotels.
          </p>
          <ActionRow>
            <ActionButton to="/" pill>
              Go home
            </ActionButton>
            <ActionButton to="/flights" variant="navy" pill>
              Search flights
            </ActionButton>
          </ActionRow>
        </div>
      </section>
    </PageLayout>
  );
}
