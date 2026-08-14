import { Component } from "react";
import * as Sentry from "@sentry/react";
import { APP_CONFIG } from "@/app/config";
import styles from "./AppErrorBoundary.module.css";

/**
 * Root crash fence. Reports to Sentry when DSN is configured; never dumps stacks.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    } catch {
      /* sentry optional */
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className={styles.wrap} role="alert">
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.copy}>
          Itinero hit a display error. Your bookings are safe — reload the page
          to continue, or come back from Home.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className={styles.secondary} href={`${APP_CONFIG.BASE_PATH || "/itinero"}/`}>
            Home
          </a>
          <a className={styles.secondary} href={`${APP_CONFIG.BASE_PATH || "/itinero"}/help`}>
            Help
          </a>
        </div>
      </div>
    );
  }
}
