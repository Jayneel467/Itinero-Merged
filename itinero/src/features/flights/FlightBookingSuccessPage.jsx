import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plane, Calendar, MapPin, Printer, Download, ChevronRight, Share2, Star } from 'lucide-react';
import { PageLayout } from "@/components/layout";

export default function FlightBookingSuccessPage() {
  const navigate = useNavigate();

  return (
    <PageLayout>
      {/* Premium Gradient Background */}
      <div className="min-h-screen bg-gray-50 pb-[100px] relative overflow-hidden font-sans">
        
        {/* Dynamic Background Elements */}
        <div className="absolute top-0 left-0 w-full h-[450px] bg-[#001439] rounded-b-[40px] md:rounded-b-[80px] z-0 overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[150%] bg-gradient-to-tr from-[#F97211]/20 to-transparent blur-[120px] rounded-full mix-blend-screen pointer-events-none"></div>
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[100%] bg-gradient-to-bl from-[#0052CC]/30 to-transparent blur-[100px] rounded-full mix-blend-screen pointer-events-none"></div>
          
          {/* Subtle Grid Pattern */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_#ffffff_1px,_transparent_1px)] [background-size:24px_24px]"></div>
        </div>

        <div className="max-w-[850px] mx-auto px-4 pt-16 relative z-10">
          
          {/* Success Banner */}
          <div className="text-center mb-12 animate-in slide-in-from-top-10 fade-in duration-700">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-[#089C2F] blur-[20px] opacity-40 rounded-full animate-pulse"></div>
              <div className="w-24 h-24 bg-gradient-to-tr from-[#089C2F] to-[#22c55e] rounded-full flex items-center justify-center relative z-10 shadow-2xl border-4 border-white/20">
                <Check className="w-12 h-12 text-white stroke-[3]" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 tracking-tight">Booking Confirmed!</h1>
            <p className="text-white/80 text-lg md:text-xl font-medium max-w-2xl mx-auto">
              Your epic journey awaits. We've sent the e-ticket to your email.
            </p>
          </div>

          {/* Premium Boarding Pass Card */}
          <div className="relative animate-in slide-in-from-bottom-16 fade-in duration-1000 delay-200">
            {/* Top Shine Effect */}
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-white/50 to-transparent z-20"></div>

            <div className="bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] overflow-hidden relative">
              
              {/* Header Section */}
              <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 p-6 md:p-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#F97211]/10 rounded-[12px] flex items-center justify-center">
                    <Plane className="w-6 h-6 text-[#F97211]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Booking Reference</p>
                    <div className="text-2xl font-black text-[#001439] tracking-widest">X8Y2M9</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 bg-[#089C2F]/10 text-[#089C2F] px-4 py-2 rounded-full text-sm font-bold">
                    <div className="w-2 h-2 bg-[#089C2F] rounded-full animate-pulse"></div>
                    Confirmed
                  </div>
                </div>
              </div>

              {/* Main Flight Info Section */}
              <div className="p-6 md:p-10 relative">
                {/* Background Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                  <Plane size={300} className="-rotate-45" />
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center relative z-10 gap-8">
                  
                  {/* Origin */}
                  <div className="text-center md:text-left w-full md:w-1/3">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Departure</p>
                    <h2 className="text-5xl md:text-6xl font-black text-[#001439] tracking-tighter mb-2">LHR</h2>
                    <p className="text-lg font-bold text-gray-800">London Heathrow</p>
                    <div className="mt-4 inline-block bg-gray-50 rounded-[12px] px-4 py-2 border border-gray-100">
                      <p className="text-xs text-gray-500 font-semibold mb-0.5">09:30 AM</p>
                      <p className="text-sm font-bold text-[#001439]">14 Sep, Tue</p>
                    </div>
                  </div>

                  {/* Flight Path Animation */}
                  <div className="w-full md:w-1/3 flex flex-col items-center">
                    <div className="bg-[#F97211]/10 text-[#F97211] px-3 py-1 rounded-full text-xs font-bold mb-4">6h 45m</div>
                    <div className="w-full flex items-center relative">
                      <div className="w-3 h-3 rounded-full border-2 border-[#001439] bg-white z-10"></div>
                      <div className="flex-1 h-[2px] bg-gradient-to-r from-[#001439] via-[#F97211] to-[#001439] relative overflow-hidden">
                         <div className="absolute inset-0 bg-white/50 w-full animate-[slideRight_2s_ease-in-out_infinite]"></div>
                      </div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 z-10">
                        <Plane className="w-6 h-6 text-[#F97211] drop-shadow-md" />
                      </div>
                      <div className="w-3 h-3 rounded-full border-2 border-[#001439] bg-[#001439] z-10"></div>
                    </div>
                    <div className="text-xs font-bold text-gray-400 mt-4 uppercase tracking-widest">Non-stop</div>
                  </div>

                  {/* Destination */}
                  <div className="text-center md:text-right w-full md:w-1/3">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Arrival</p>
                    <h2 className="text-5xl md:text-6xl font-black text-[#001439] tracking-tighter mb-2">DXB</h2>
                    <p className="text-lg font-bold text-gray-800">Dubai Intl</p>
                    <div className="mt-4 inline-block bg-gray-50 rounded-[12px] px-4 py-2 border border-gray-100">
                      <p className="text-xs text-gray-500 font-semibold mb-0.5">07:15 PM</p>
                      <p className="text-sm font-bold text-[#001439]">14 Sep, Tue</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Tear-off Separator line */}
              <div className="relative flex items-center">
                <div className="absolute -left-4 w-8 h-8 bg-gray-50 rounded-full shadow-inner border-r border-gray-200"></div>
                <div className="w-full border-t-[3px] border-dashed border-gray-200"></div>
                <div className="absolute -right-4 w-8 h-8 bg-gray-50 rounded-full shadow-inner border-l border-gray-200"></div>
              </div>

              {/* Details & Barcode Section */}
              <div className="bg-white p-6 md:p-10 flex flex-col md:flex-row justify-between items-center gap-8">
                
                <div className="w-full md:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Airline</p>
                    <p className="text-sm font-black text-[#001439]">Emirates</p>
                    <p className="text-xs font-semibold text-gray-500">EK 203</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Class</p>
                    <p className="text-sm font-black text-[#001439]">Economy</p>
                    <p className="text-xs font-semibold text-gray-500">Seat 12A</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Passengers</p>
                    <p className="text-sm font-black text-[#001439]">2 Adults</p>
                    <p className="text-xs font-semibold text-gray-500">1 Child</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Terminal</p>
                    <p className="text-sm font-black text-[#001439]">Term 3</p>
                    <p className="text-xs font-semibold text-gray-500">Gate 42</p>
                  </div>
                </div>

                {/* Fake Barcode */}
                <div className="w-full md:w-1/3 flex flex-col items-center border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-8">
                  <div className="h-16 w-full max-w-[200px] bg-[repeating-linear-gradient(to_right,#001439_0,#001439_2px,transparent_2px,transparent_4px,#001439_4px,#001439_5px,transparent_5px,transparent_8px,#001439_8px,#001439_12px,transparent_12px,transparent_14px)] opacity-80"></div>
                  <p className="text-[10px] tracking-[0.3em] font-mono mt-2 text-gray-500">2938475610293</p>
                </div>
              </div>
              
              {/* Action Footer */}
              <div className="bg-[#F0F7FF] p-6 flex flex-wrap gap-4 justify-center md:justify-between items-center border-t border-blue-100">
                <div className="flex items-center gap-2 text-[#0052CC] font-semibold text-sm">
                  <Star size={18} className="fill-[#0052CC]" />
                  You earned 120 Itinero Points
                </div>
                <div className="flex gap-3">
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-[12px] text-sm font-bold text-[#001439] hover:bg-gray-50 hover:shadow-sm transition-all">
                    <Share2 size={16} /> Share
                  </button>
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-[12px] text-sm font-bold text-[#001439] hover:bg-gray-50 hover:shadow-sm transition-all">
                    <Download size={16} /> Save PDF
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center animate-in slide-in-from-bottom-10 fade-in duration-1000 delay-300">
            <button 
              onClick={() => navigate('/')}
              className="px-8 py-4 bg-white border-2 border-[#001439] text-[#001439] rounded-[12px] font-bold hover:bg-gray-50 transition-all flex items-center justify-center group"
            >
              Back to Home
            </button>
            <button 
              onClick={() => navigate('/flights')}
              className="px-8 py-4 bg-[#F97211] text-white rounded-[12px] font-bold shadow-[0_10px_20px_-10px_rgba(249,114,17,0.5)] hover:bg-[#e0650e] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
            >
              Book Another Flight <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
      </div>
    </PageLayout>
  );
}
