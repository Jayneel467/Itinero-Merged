import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CustomDatePicker({ selected, onChange, minDate, customInput, wrapperClassName = "relative flex-1" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(selected || new Date());
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleSelectDate = (dateObj, isDisabled, e) => {
    e.stopPropagation();
    if (isDisabled) return;
    onChange(dateObj);
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const monthName = currentMonth.toLocaleDateString("en-US", { month: "long" });
    
    let minDateParsed = null;
    if (minDate) {
      minDateParsed = new Date(minDate);
      minDateParsed.setHours(0,0,0,0);
    }

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      
      let isDisabled = false;
      if (minDateParsed && dateObj < minDateParsed) isDisabled = true;
      
      let isSelected = false;
      if (selected && dateObj.getTime() === new Date(selected).setHours(0,0,0,0)) {
        isSelected = true;
      }

      days.push(
        <div 
          key={d} 
          onClick={(e) => handleSelectDate(dateObj, isDisabled, e)}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors select-none
            ${isDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 cursor-pointer hover:bg-gray-100'}
            ${isSelected ? '!bg-[#F97211] !text-white font-bold shadow-md' : ''}
          `}
        >
          {d}
        </div>
      );
    }

    return (
      <div className="p-4 w-[280px]">
        <div className="flex items-center justify-between mb-4">
          <button onClick={handlePrevMonth} className="p-1.5 hover:bg-gray-100 rounded-full cursor-pointer text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold text-base text-gray-900">{monthName} {year}</span>
          <button onClick={handleNextMonth} className="p-1.5 hover:bg-gray-100 rounded-full cursor-pointer text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-y-1 mb-2">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map((day, i) => (
            <div key={i} className="w-8 h-8 flex items-center justify-center font-semibold text-gray-400 text-xs">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days}
        </div>
      </div>
    );
  };

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className={wrapperClassName} ref={dropdownRef}>
      {customInput ? (
        React.cloneElement(customInput, { onClick: toggleOpen, value: formatDate(selected), isOpen })
      ) : (
        <div 
          className={`w-full border rounded-lg p-3 transition-colors flex items-center justify-between cursor-pointer bg-white
            ${isOpen ? 'border-[#F97211] ring-2 ring-[#F97211]/20' : 'border-gray-200 hover:border-gray-300'}
          `}
          onClick={toggleOpen}
        >
          <span className="text-[#001439] font-medium text-sm select-none">{formatDate(selected)}</span>
          <CalendarIcon size={16} className={`${isOpen ? 'text-[#F97211]' : 'text-gray-400'}`} />
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-[calc(100%+8px)] left-0 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-gray-100 z-[100] overflow-hidden"
          >
            {renderCalendar()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
