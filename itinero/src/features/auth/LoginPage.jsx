import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginModal from "./components/LoginModal";
import "./LoginPage.css";

const LOGO = `${import.meta.env.BASE_URL}itinero-logo.png`;
const VERO = `${import.meta.env.BASE_URL}vero-chatbot.png`;

/**
 * Dedicated /login route - branded stage + auth modal.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    navigate("/");
  };

  const handleSuccess = () => {
    setIsOpen(false);
    navigate("/profile");
  };

  return (
    <div className="auth-page">
      <div className="auth-page__glow auth-page__glow--a" aria-hidden />
      <div className="auth-page__glow auth-page__glow--b" aria-hidden />

      <div className="auth-page__stage">
        <div className="auth-page__logo-wrap">
          <img src={LOGO} alt="itinero" className="auth-page__logo" />
        </div>
        <img src={VERO} alt="" className="auth-page__vero" draggable={false} />
        <p className="auth-page__kicker">Your trip starts here</p>
        <h1 className="auth-page__title">
          Welcome back to <em>itinero.</em>
        </h1>
        <p className="auth-page__copy">
          Sign in with Google or a one-time email code - save trips, alerts, and deals with Vero.
        </p>
        <button type="button" className="auth-page__cta" onClick={() => setIsOpen(true)}>
          Continue to sign in
        </button>
        <p className="auth-page__foot">Google · Email code · No password</p>
      </div>

      <LoginModal
        isOpen={isOpen}
        onClose={handleClose}
        onLoginSuccess={handleSuccess}
      />
    </div>
  );
}
