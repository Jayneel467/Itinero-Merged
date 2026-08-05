import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginModal from "./components/LoginModal";
import "./LoginPage.css";

/**
 * Login page — opens the existing auth modal as a dedicated route.
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
      <div className="auth-card">
        <h1>Welcome Back</h1>
        <p className="auth-card__subtitle">
          Sign in with your phone or Google to continue booking.
        </p>
        <button
          type="button"
          className="auth-card__cta"
          onClick={() => setIsOpen(true)}
        >
          Continue to Sign In
        </button>
      </div>
      <LoginModal
        isOpen={isOpen}
        onClose={handleClose}
        onLoginSuccess={handleSuccess}
      />
    </div>
  );
}
