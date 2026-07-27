import React, { useState, useEffect, useRef } from 'react';

const LoginModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState('MAIN'); // MAIN, PHONE, OTP, SETUP
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  // Reset to MAIN step when modal is closed
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('MAIN');
        setAccountIdentifier('');
        setPhoneError('');
        setOtp(['', '', '', '', '', '']);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  const handleOtpChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }

    // Auto submit to SETUP step if last digit is entered
    if (value && index === 5) {
      setTimeout(() => setStep('SETUP'), 300);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // On Backspace, if current is empty, focus previous
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Helper for step transitions
  const getStepClasses = (currentStep) => {
    const isActive = step === currentStep && isOpen;
    return `absolute inset-0 flex items-center justify-center p-0 md:p-4 transition-all duration-500 ease-in-out ${
      isActive ? 'opacity-100 z-10 scale-100' : 'opacity-0 -z-10 scale-95 pointer-events-none'
    }`;
  };

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center transition-all duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      ></div>

      {/* STEP 1: MAIN */}
      <div className={getStepClasses('MAIN')}>
        <div className="relative w-full h-full md:h-auto max-w-[850px] bg-white rounded-none md:rounded-[32px] shadow-2xl overflow-y-auto md:overflow-hidden flex flex-col md:flex-row md:min-h-[500px] animate-slide-down-modal md:animate-none">
          
          {/* Close Button */}
          <button 
            onClick={handleClose}
            className="absolute top-6 right-6 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors z-20 cursor-pointer shadow-sm"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          {/* Left Side */}
          <div className="w-full md:w-[50%] p-8 md:p-12 pb-0 flex flex-col relative overflow-hidden bg-white">
            <div className="relative z-10">
              {/* Logo Icon */}
              <div className="relative w-12 h-12 mb-8">
                <div className="absolute inset-0 bg-[#F97316] rounded-xl transform -rotate-6 flex items-center justify-center">
                  <span className="text-white font-black text-2xl font-sans">I</span>
                </div>
                {/* Sparkles */}
                <div className="absolute -top-3 -right-3 text-[#F97316]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M22 12h-4M18.5 5.5l-3 3M5.5 5.5l3 3M2 12h4"/></svg>
                </div>
              </div>

              <h2 className="text-[32px] leading-[1.15] font-bold text-gray-900 mb-4 tracking-tight">
                Welcome to<br />
                <span className="text-[#F97316]">ITINERO.</span><br />
                Let's get you going.
              </h2>

              <p className="text-gray-500 text-[15px] leading-relaxed pr-4 mb-8">
                Sign in or create an account to save searches, create Price Alerts, see Private Deals, and more.
              </p>
            </div>

            {/* Decorative Illustration */}
            <div className="mt-auto relative h-[120px] md:h-[180px] w-full pt-4 -mx-4 w-[calc(100%+32px)] overflow-hidden">
                <div className="absolute bottom-0 left-[-20%] right-[-20%] h-[120px] bg-gradient-to-t from-orange-50/80 to-transparent rounded-t-[100%]"></div>
                <div className="absolute bottom-0 left-[-50%] right-[20%] h-[80px] bg-gradient-to-t from-orange-100/50 to-transparent rounded-t-[100%]"></div>
                
                {/* Suitcase */}
                <div className="absolute bottom-2 left-1/2 -translate-x-[50px] w-16 h-24 bg-gradient-to-br from-[#FFAD90] to-[#FF8960] rounded-[10px] shadow-sm">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-7 h-5 border-2 border-[#FFAD90] rounded-t-md border-b-0"></div>
                  <div className="absolute inset-0 flex justify-evenly py-2">
                    <div className="w-px bg-white/20 h-full"></div>
                    <div className="w-px bg-white/20 h-full"></div>
                    <div className="w-px bg-white/20 h-full"></div>
                  </div>
                </div>

                <div className="absolute top-8 right-[30%] text-gray-300 transform -rotate-12">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                </div>

                <div className="absolute bottom-8 left-[15%] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#F97316"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                </div>

                <div className="absolute bottom-12 right-[15%] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FBBF24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                </div>
            </div>
          </div>

          {/* Right Side */}
          <div className="w-full md:w-[50%] p-8 md:p-12 md:pt-[85px] flex flex-col bg-white border-l border-gray-100">
            
            <button 
              onClick={() => {
                setAccountIdentifier('gajerayash89@gmail.com');
                setStep('SETUP');
              }}
              className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all mb-6 cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <svg width="24" height="24" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                </svg>
                <span className="font-semibold text-gray-800 text-[15px]">Continue with Google</span>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-gray-900 transition-colors"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-gray-400 text-sm font-medium px-2">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <button 
              onClick={() => setStep('PHONE')}
              className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all mb-8 cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span className="font-semibold text-gray-800 text-[15px]">Continue with Phone</span>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-gray-900 transition-colors"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            {/* Privacy Box */}
            <div className="bg-[#F0F7FA] rounded-2xl p-4 md:p-5 flex gap-3 mb-8">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              <div>
                <h4 className="font-bold text-gray-900 text-[14px] mb-1">We value your privacy</h4>
                <p className="text-gray-600 text-[13px] leading-relaxed">
                  We'll never post anything without your permission.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-gray-500 mt-auto leading-relaxed pt-6">
              By continuing, you accept our <a href="#" className="text-[#F97316] font-medium hover:underline">Terms of use</a> and <a href="#" className="text-[#F97316] font-medium hover:underline">Privacy Policy</a>.
            </p>
          </div>

        </div>
      </div>


      {/* STEP 2: PHONE INPUT */}
      <div className={getStepClasses('PHONE')}>
        <div className="relative w-full h-full md:h-auto max-w-[450px] bg-white rounded-none md:rounded-[32px] p-6 md:p-10 shadow-2xl overflow-y-auto animate-slide-down-modal md:animate-none">
          
          <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => setStep('MAIN')} 
              className="flex items-center gap-2 text-[15px] font-semibold text-gray-900 hover:text-[#F97316] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Back
            </button>
            <button 
              onClick={handleClose} 
              className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <h2 className="text-[26px] md:text-[32px] leading-tight font-bold text-gray-900 mb-8">
            What's your phone<br />number?
          </h2>

          <input 
            type="tel" 
            placeholder="Enter Phone number" 
            value={accountIdentifier}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              setAccountIdentifier(val);
              if (val.length === 10) setPhoneError('');
            }}
            className={`w-full p-4 border rounded-xl outline-none transition-all text-[15px] ${phoneError ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] mb-6'}`}
          />
          {phoneError && <p className="text-red-500 text-[13px] mt-2 mb-6">{phoneError}</p>}

          <button 
            onClick={() => {
              if (accountIdentifier.length < 10) {
                setPhoneError('Please enter a valid 10-digit phone number.');
              } else {
                setPhoneError('');
                setStep('OTP');
              }
            }}
            className="w-full bg-[#F97316] text-white font-semibold py-4 rounded-xl hover:bg-[#E86000] transition-colors text-[16px] cursor-pointer"
          >
            Sign in
          </button>
        </div>
      </div>


      {/* STEP 3: OTP VERIFICATION */}
      <div className={getStepClasses('OTP')}>
        <div className="relative w-full h-full md:h-auto max-w-[450px] bg-white rounded-none md:rounded-[32px] p-6 md:p-10 shadow-2xl overflow-y-auto animate-slide-down-modal md:animate-none">
          
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setStep('PHONE')} 
              className="flex items-center gap-2 text-[15px] font-semibold text-gray-900 hover:text-[#F97316] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Back
            </button>
            <button 
              onClick={handleClose} 
              className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Decorative Hat / Illustration */}
          <div className="flex justify-center mb-8 relative h-[160px]">
             <div className="absolute bottom-4 w-32 h-16 bg-gradient-to-b from-[#FFA755] to-[#FF6B00] rounded-b-2xl rounded-t-sm shadow-inner z-10 border-b-[4px] border-[#E65C00]"></div>
             <div className="absolute bottom-20 w-44 h-10 bg-[#FF6B00] rounded-[50%] z-20 border-[4px] border-[#FFA755]"></div>
             <div className="absolute bottom-[84px] w-32 h-10 bg-[#E65C00] rounded-[50%] z-0"></div>
             
             {/* Phone coming out */}
             <div className="absolute bottom-16 w-16 h-[100px] bg-gradient-to-b from-[#FFA755] to-[#FF6B00] rounded-xl z-0 border-2 border-white shadow-lg flex items-center justify-center transform -translate-y-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
             </div>

             {/* Wand */}
             <div className="absolute bottom-0 right-10 w-28 h-3 bg-gradient-to-r from-orange-200 to-orange-500 transform -rotate-[20deg] rounded-full shadow-sm z-30 border border-orange-300"></div>
             <div className="absolute bottom-0 right-10 w-4 h-3 bg-white/50 rounded-full z-40 transform -rotate-[20deg]"></div>

             {/* Stars */}
             <div className="absolute bottom-8 left-8 text-[#FFC107]"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
             <div className="absolute top-2 left-[30%] text-[#FFC107]"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
             <div className="absolute top-10 right-16 text-[#FFC107]"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
          </div>

          <h2 className="text-[22px] font-bold text-gray-900 mb-4 text-center">
            Please Verify your phone number.
          </h2>

          <p className="text-gray-600 text-[13px] leading-relaxed mb-6 text-center">
            We just sent a 6-digit verification code to your phone; <br/>
            <strong className="text-gray-900 font-bold">{accountIdentifier || '+91 9876543210'}</strong>. Please enter the code within <br/>
            <strong className="text-gray-900 font-bold">10 Minutes</strong>.
          </p>

          {/* OTP Inputs */}
          <div className="flex justify-between gap-2 mb-8">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <input 
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="1"
                value={otp[index]}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="aspect-square w-full max-w-[44px] md:max-w-[56px] border border-gray-300 rounded-[10px] text-center text-[18px] md:text-xl font-bold text-gray-900 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] outline-none transition-all"
              />
            ))}
          </div>

          {/* Spam Info Box */}
          <div className="bg-[#F8F9FA] rounded-xl p-4 flex gap-4 items-center">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </div>
            <p className="text-gray-500 text-[12px] leading-[1.4]">
              Can't find the SMS? Try checking your spam folder, or send a new code.
            </p>
          </div>

        </div>
      </div>

      {/* STEP 4: SETUP */}
      <div className={getStepClasses('SETUP')}>
        <div className="relative w-full h-full md:h-auto max-w-[450px] bg-white rounded-none md:rounded-[32px] p-6 md:p-10 shadow-2xl overflow-y-auto animate-slide-down-modal md:animate-none">
          
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setStep(accountIdentifier.includes('@') ? 'MAIN' : 'OTP')} 
              className="flex items-center gap-2 text-[15px] font-semibold text-gray-900 hover:text-[#F97316] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Back
            </button>
            <button 
              onClick={handleClose} 
              className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Decorative Hat / Illustration (same as OTP) */}
          <div className="flex justify-center mb-8 relative h-[160px]">
             <div className="absolute bottom-4 w-32 h-16 bg-gradient-to-b from-[#FFA755] to-[#FF6B00] rounded-b-2xl rounded-t-sm shadow-inner z-10 border-b-[4px] border-[#E65C00]"></div>
             <div className="absolute bottom-20 w-44 h-10 bg-[#FF6B00] rounded-[50%] z-20 border-[4px] border-[#FFA755]"></div>
             <div className="absolute bottom-[84px] w-32 h-10 bg-[#E65C00] rounded-[50%] z-0"></div>
             
             <div className="absolute bottom-16 w-16 h-[100px] bg-gradient-to-b from-[#FFA755] to-[#FF6B00] rounded-xl z-0 border-2 border-white shadow-lg flex items-center justify-center transform -translate-y-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
             </div>

             <div className="absolute bottom-0 right-10 w-28 h-3 bg-gradient-to-r from-orange-200 to-orange-500 transform -rotate-[20deg] rounded-full shadow-sm z-30 border border-orange-300"></div>
             <div className="absolute bottom-0 right-10 w-4 h-3 bg-white/50 rounded-full z-40 transform -rotate-[20deg]"></div>

             <div className="absolute bottom-8 left-8 text-[#FFC107]"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
             <div className="absolute top-2 left-[30%] text-[#FFC107]"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
             <div className="absolute top-10 right-16 text-[#FFC107]"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6 4.8 2.4 7.6-6-4.8-6 4.8 2.4-7.6-6-4.8h7.6z"/></svg></div>
          </div>

          <h2 className="text-[26px] font-bold text-gray-900 mb-2 text-center">
            Let's get you set up<span className="text-[#F97316]">.</span>
          </h2>

          <p className="text-gray-600 text-[14px] leading-relaxed mb-6 text-center">
            We'll create an account for <strong className="text-gray-900 font-bold">{accountIdentifier}</strong>
          </p>

          {/* Create Account Button */}
          <button 
            onClick={() => {
              // Create account logic goes here
              alert("Account Created Successfully!");
              handleClose();
            }}
            className="w-full bg-[#F97316] text-white font-semibold py-[14px] px-4 rounded-xl hover:bg-[#E86000] transition-colors text-[16px] flex items-center justify-between mb-4 cursor-pointer"
          >
            <span className="flex-1 text-center font-bold pl-8">Create your account</span>
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </button>

          {/* Newsletter Checkbox */}
          <div className="border border-gray-200 rounded-xl p-3.5 flex items-center gap-3 mb-6">
             <input type="checkbox" id="newsletter" className="w-4 h-4 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]" defaultChecked />
             <label htmlFor="newsletter" className="text-[13px] font-semibold text-gray-800 flex-1 cursor-pointer">
                Email me ITINERO's favourite deals
             </label>
             <div className="w-6 h-6 rounded bg-orange-50 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>
             </div>
          </div>

          <div className="flex items-start gap-2 justify-center px-4">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
             <p className="text-[11px] text-gray-500 leading-snug">
                By signing up, you accept our <a href="#" className="text-[#F97316] font-medium hover:underline">Terms of use</a> and <a href="#" className="text-[#F97316] font-medium hover:underline">Privacy Policy</a>.
             </p>
          </div>

        </div>
      </div>
      
    </div>
  );
};

export default LoginModal;
