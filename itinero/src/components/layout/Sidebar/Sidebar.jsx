import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar = ({ 
  isOpen, 
  onClose,
  selectedLanguage = "en-US",
  selectedLanguageFlag = "https://flagcdn.com/w40/us.png",
  selectedCurrency = "USD",
  selectedCurrencySymbol = "$",
  onOpenCurrencyModal,
  onOpenLanguageModal
}) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-[98]" 
          onClick={onClose}
          aria-hidden="true"
        ></div>
      )}

      {/* Sidebar Content */}
      <div 
        className={`absolute top-[100%] left-0 w-[280px] h-[100vh] max-w-[85vw] bg-white shadow-xl z-[99] transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-label="Main menu"
        aria-hidden={!isOpen}
      >
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="flex flex-col">
            <li className="px-4 py-1">
              <Link to="/flights" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 bg-[#E8EDF2] rounded-md text-[#111418] font-medium text-[15px] min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                <span>Flights</span>
              </Link>
            </li>
            <li className="px-4 py-1">
              <Link to="/hotels" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/></svg>
                <span>Hotels</span>
              </Link>
            </li>
            <li className="px-4 py-1">
              <Link to="/vero" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-1.17L17 1 16.17 3H15v1.17L17 5l.83-2H19zM6.5 6 5 2l-1.5 4L0 7.5 3.5 9 5 13l1.5-4L10 7.5zm5.5 5-2-5.5L8 11l-5.5 2L8 15l2 5.5L12 15l5.5-2zM15 15h-1.17L13 13l-.83 2H11v1.17l1.17.83L13 19l.83-2H15z"/></svg>
                <span>Ask Vero</span>
              </Link>
            </li>
            
            <div className="border-t border-[#E8EDF2] my-2 mx-4"></div>
            
            <li className="px-4 py-1">
              <Link to="/" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                <span>Explore</span>
              </Link>
            </li>
            <li className="px-4 py-1">
              <Link to="/flights" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <span>Trip</span>
              </Link>
            </li>
            
            <div className="border-t border-[#E8EDF2] my-2 mx-4"></div>
            
            <li className="px-4 py-1">
              <button 
                onClick={onOpenLanguageModal}
                className="w-full flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors text-left"
              >
                <img 
                  src={selectedLanguageFlag} 
                  alt="Language Flag" 
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }} 
                />
                <span>{selectedLanguage === "en-US" ? "English" : selectedLanguage}</span>
              </button>
            </li>
            <li className="px-4 py-1">
              <button 
                onClick={onOpenCurrencyModal}
                className="w-full flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors text-left"
              >
                <span className="text-[20px] font-medium leading-none w-6 text-center text-[#111418]">{selectedCurrencySymbol}</span>
                <span>{selectedCurrency}</span>
              </button>
            </li>
            <li className="px-4 py-1">
              <Link to="/vero" onClick={onClose} className="flex items-center space-x-4 px-4 py-3 text-[#637588] hover:bg-[#F0F4F8] rounded-md font-medium text-[15px] transition-colors min-h-[44px]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/></svg>
                <span>Feedback</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
