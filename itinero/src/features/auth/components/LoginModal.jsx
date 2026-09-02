import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { authService } from '../services/authService';
import { useAuthOptional } from '../context/AuthContext';
import { APP_CONFIG } from '@/app/config';
import { attributionForSignup } from '@/services/attribution';
import { trackSignupComplete } from '@/services/acquisitionPixels';
import styles from './LoginModal.module.css';

const LOGO = `${import.meta.env.BASE_URL}itinero-logo.png`;
const VERO = `${import.meta.env.BASE_URL}vero-chatbot.png`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
  );
}

const LoginModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const auth = useAuthOptional();
  const [step, setStep] = useState('MAIN');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [emailError, setEmailError] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [setupName, setSetupName] = useState('');
  const [setupError, setSetupError] = useState('');
  const [newsletter, setNewsletter] = useState(true);
  const [resendIn, setResendIn] = useState(0);
  const [googleError, setGoogleError] = useState('');
  const inputRefs = useRef([]);
  const emailInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('MAIN');
        setAccountIdentifier('');
        setEmailError('');
        setOtp(['', '', '', '', '', '']);
        setBusy(false);
        setOtpError('');
        setDevOtp('');
        setPendingToken('');
        setSetupName('');
        setSetupError('');
        setNewsletter(true);
        setResendIn(0);
        setGoogleError('');
      }, 300);
      return () => clearTimeout(timer);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (isOpen && step === 'EMAIL') {
      setTimeout(() => emailInputRef.current?.focus?.(), 50);
    }
  }, [isOpen, step]);

  const finishLogin = (user) => {
    if (typeof onLoginSuccess === 'function') onLoginSuccess(user);
    else onClose();
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    const credential = credentialResponse?.credential;
    if (!credential) {
      setGoogleError('Google sign-in did not return a token. Try again.');
      return;
    }
    setBusy(true);
    setGoogleError('');
    try {
      const res = auth?.loginWithGoogle
        ? await auth.loginWithGoogle(credential)
        : await authService.loginWithGoogle(credential);
      if (res?.token && res?.user) {
        finishLogin(res.user);
        return;
      }
      setGoogleError(res?.message || 'Google sign-in failed. Try again.');
    } catch (err) {
      setGoogleError(err?.message || 'Google sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const googleEnabled = Boolean(APP_CONFIG.GOOGLE_CLIENT_ID);

  const sendCode = async () => {
    const raw = accountIdentifier.trim().toLowerCase();
    if (!EMAIL_RE.test(raw)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setEmailError('');
    setOtpError('');
    try {
      const res = await authService.sendOtp(raw);
      setAccountIdentifier(raw);
      setDevOtp(res?.dev_otp || '');
      setOtp(['', '', '', '', '', '']);
      setResendIn(30);
      setStep('OTP');
      setTimeout(() => inputRefs.current[0]?.focus?.(), 50);
    } catch (err) {
      setEmailError(err?.message || 'Could not send code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (digits) => {
    const code = (digits || otp).join('');
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setOtpError('');
    try {
      const res = auth?.loginWithOtp
        ? await auth.loginWithOtp(accountIdentifier, code)
        : await authService.verifyOtp(accountIdentifier, code);
      if (res?.needs_setup) {
        setPendingToken(res.pending_token || '');
        setStep('SETUP');
        return;
      }
      if (res?.token && res?.user) {
        finishLogin(res.user);
        return;
      }
      setOtpError(res?.message || 'Could not verify that code.');
    } catch (err) {
      setOtpError(err?.message || 'Wrong or expired code.');
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!pendingToken) {
      setSetupError('Verify the code again.');
      return;
    }
    if (!setupName.trim()) {
      setSetupError('Enter your name to continue.');
      return;
    }
    setBusy(true);
    setSetupError('');
    try {
      const payload = {
        pending_token: pendingToken,
        name: setupName.trim(),
        email: accountIdentifier.trim(),
        newsletter,
        ...attributionForSignup(),
      };
      const res = auth?.completeSignup
        ? await auth.completeSignup(payload)
        : await authService.register(payload);
      if (res?.token && res?.user) {
        trackSignupComplete();
        finishLogin(res.user);
        return;
      }
      setSetupError(res?.message || 'Could not create account.');
    } catch (err) {
      setSetupError(err?.message || 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      digits.forEach((d, i) => {
        next[i] = d;
      });
      setOtp(next);
      if (digits.length === 6) verifyCode(next);
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus?.();
    if (value && index === 5) verifyCode(newOtp);
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const LogoBadge = ({ large } = {}) => (
    <div className={styles.logoBadge}>
      <img src={LOGO} alt="itinero" className={`${styles.logoImg} ${large ? styles.logoImgLg : ''}`} />
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className={`${styles.shell} ${styles.shellOpen}`}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.backdrop} onClick={onClose} />

      {step === 'MAIN' ? (
      <div className={`${styles.step} ${styles.stepActive}`}>
        <div className={styles.panel}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>

          <div className={styles.brandCol}>
            <LogoBadge large />
            <h2 className={styles.headline}>
              Welcome to
              <br />
              <span className={styles.headlineAccent}>itinero.</span>
              <br />
              Let&apos;s get you going.
            </h2>
            <p className={styles.brandCopy}>
              Sign in or create an account to keep trips, Saved hearts, price alerts, and Vero credits with you.
            </p>
            <div className={styles.brandFoot}>
              <img src={VERO} alt="" className={styles.vero} draggable={false} />
              <p className={styles.speech}>Vero keeps your trips, alerts, and credits in one place.</p>
            </div>
          </div>

          <div className={styles.authCol}>
            {googleEnabled ? (
              <>
                <div className={styles.googleBtnHost}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setGoogleError('Google sign-in was cancelled or failed.')}
                    useOneTap={false}
                    theme="outline"
                    size="large"
                    text="continue_with"
                    shape="rectangular"
                    width={typeof window !== 'undefined' ? String(Math.min(360, Math.max(240, window.innerWidth - 56))) : '360'}
                    locale="en"
                  />
                </div>
                {googleError ? <p className={styles.inlineError}>{googleError}</p> : null}
                <div className={styles.divider}>or</div>
              </>
            ) : null}

            <button
              type="button"
              className={`${styles.methodBtn} ${googleEnabled ? '' : styles.methodPrimary}`}
              onClick={() => setStep('EMAIL')}
            >
              <div className={styles.methodLeft}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span className={styles.methodLabel}>Continue with email</span>
              </div>
              <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            {!googleEnabled ? (
              <button type="button" className={styles.methodBtn} disabled title="Google sign-in not configured">
                <div className={styles.methodLeft}>
                  <GoogleIcon />
                  <span className={styles.methodLabel}>Continue with Google</span>
                </div>
                <span className={styles.soon}>Soon</span>
              </button>
            ) : null}

            <div className={styles.privacy} style={{ marginTop: 24 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <div>
                <h4 className={styles.privacyTitle}>We value your privacy</h4>
                <p className={styles.privacyCopy}>We&apos;ll never post anything without your permission.</p>
              </div>
            </div>

            <p className={styles.legal}>
              By continuing, you accept our{' '}
              <Link to="/terms" onClick={onClose}>Terms of use</Link> and{' '}
              <Link to="/privacy" onClick={onClose}>Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
      ) : null}

      {step === 'EMAIL' ? (
      <div className={`${styles.step} ${styles.stepActive}`}>
        <div className={styles.panelNarrow}>
          <div className={styles.navRow}>
            <button type="button" className={styles.back} onClick={() => setStep('MAIN')} disabled={busy}>
              <BackIcon /> Back
            </button>
            <button type="button" className={styles.close} style={{ position: 'static' }} onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <LogoBadge />
          <h2 className={styles.stepTitle}>What&apos;s your email?</h2>
          <p className={styles.stepSub}>We&apos;ll send a 6-digit code to sign you in.</p>

          <input
            ref={emailInputRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={accountIdentifier}
            disabled={busy}
            onChange={(e) => {
              setAccountIdentifier(e.target.value.slice(0, 120));
              setEmailError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                sendCode();
              }
            }}
            className={`${styles.field} ${emailError ? styles.fieldError : ''}`}
          />
          {emailError ? <p className={styles.error}>{emailError}</p> : null}
          {busy ? (
            <p className={styles.stepHint}>Sending - this can take up to 30 seconds…</p>
          ) : null}

          <button type="button" className={styles.primary} onClick={sendCode} disabled={busy}>
            {busy ? 'Sending code…' : 'Send code'}
          </button>
        </div>
      </div>
      ) : null}

      {step === 'OTP' ? (
      <div className={`${styles.step} ${styles.stepActive}`}>
        <div className={styles.panelNarrow}>
          <div className={styles.navRow}>
            <button type="button" className={styles.back} onClick={() => setStep('EMAIL')} disabled={busy}>
              <BackIcon /> Back
            </button>
            <button type="button" className={styles.close} style={{ position: 'static' }} onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className={styles.veroCenter}>
            <img src={VERO} alt="" draggable={false} />
          </div>

          <h2 className={`${styles.stepTitle} ${styles.stepTitleCenter}`}>Please verify your email.</h2>
          <p className={`${styles.stepSub} ${styles.stepSubCenter}`}>
            We sent a 6-digit code to <strong>{accountIdentifier}</strong>. Enter it within{' '}
            <strong>10 minutes</strong>.
          </p>
          {devOtp ? (
            <p
              className={styles.devCode}
              style={{
                color: '#c2410c',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center',
                margin: '12px 0',
              }}
            >
              Test verification code: <strong style={{ letterSpacing: '2px', fontSize: '15px' }}>{devOtp}</strong>
            </p>
          ) : null}
          {otpError ? <p className={`${styles.error} ${styles.errorCenter}`}>{otpError}</p> : null}

          <div className={styles.otpRow}>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="1"
                value={otp[index]}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData?.getData('text') || '';
                  if (/\d{6}/.test(text)) {
                    e.preventDefault();
                    handleOtpChange(0, text.replace(/\D/g, '').slice(0, 6));
                  }
                }}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                disabled={busy}
                aria-label={`Digit ${index + 1}`}
                className={styles.otpCell}
              />
            ))}
          </div>

          <div className={styles.hintBox}>
            <div className={styles.hintIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <p>
              Can&apos;t find the email? Check spam, or{' '}
              <button type="button" onClick={sendCode} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `resend in ${resendIn}s` : 'send a new code'}
              </button>
              .
            </p>
          </div>
        </div>
      </div>
      ) : null}

      {step === 'SETUP' ? (
      <div className={`${styles.step} ${styles.stepActive}`}>
        <div className={styles.panelNarrow}>
          <div className={styles.navRow}>
            <button type="button" className={styles.back} onClick={() => setStep('OTP')} disabled={busy}>
              <BackIcon /> Back
            </button>
            <button type="button" className={styles.close} style={{ position: 'static' }} onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className={styles.logoCenter}>
            <LogoBadge large />
          </div>

          <h2 className={`${styles.stepTitle} ${styles.stepTitleCenter}`}>
            Let&apos;s get you set up<span className={styles.headlineAccent}>.</span>
          </h2>
          <p className={`${styles.stepSub} ${styles.stepSubCenter}`}>
            We&apos;ll create an account for <strong>{accountIdentifier}</strong>
          </p>

          <input
            type="text"
            placeholder="Your name"
            autoComplete="name"
            value={setupName}
            onChange={(e) => {
              setSetupName(e.target.value.slice(0, 80));
              setSetupError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                createAccount();
              }
            }}
            className={styles.field}
          />
          {setupError ? <p className={styles.error}>{setupError}</p> : null}

          <button
            type="button"
            className={`${styles.primary} ${styles.primaryRow}`}
            onClick={createAccount}
            disabled={busy}
          >
            <span>{busy ? 'Creating…' : 'Create your account'}</span>
            <div className={styles.primaryArrow}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <div className={styles.checkRow}>
            <input
              type="checkbox"
              id="newsletter"
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
            />
            <label htmlFor="newsletter">Email me itinero&apos;s favourite deals</label>
          </div>

          <div className={styles.legalTiny}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <p>
              By signing up, you accept our{' '}
              <Link to="/terms" onClick={onClose}>Terms of use</Link> and{' '}
              <Link to="/privacy" onClick={onClose}>Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
};

export default LoginModal;
