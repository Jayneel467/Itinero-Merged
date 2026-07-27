import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Calendar, Users, SwitchCamera, User, Mail, Phone, Settings, AlertCircle, Check } from 'lucide-react';
import { PageLayout } from "@/components/layout";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import overviewStyles from './FlightOverviewPage.module.css';

export default function PassengerInfoPage() {
  const [travelers, setTravelers] = useState([
    { id: 1, type: 'adult', firstName: '', lastName: '', gender: '', dob: '', nationality: '', passport: '' }
  ]);
  const [activeTab, setActiveTab] = useState('adult');
  const [isGstEnabled, setIsGstEnabled] = useState(false);
  
  // Contact State
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  
  // GST State
  const [gstNumber, setGstNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  
  // Emergency State
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  
  // Validation Errors State
  const [errors, setErrors] = useState({ travelers: {} });
  const navigate = useNavigate();

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const validateForm = () => {
    let newErrors = { travelers: {} };
    let isValid = true;

    // 1. Validate Travelers
    travelers.forEach(t => {
      const tErrors = {};
      if (!t.firstName.trim()) {
        tErrors.firstName = "First name is required";
        isValid = false;
      }
      if (!t.lastName.trim()) {
        tErrors.lastName = "Last name is required";
        isValid = false;
      }
      if (!t.gender) {
        tErrors.gender = "Gender selection is required";
        isValid = false;
      }
      if (!t.dob) {
        tErrors.dob = "Date of birth is required";
        isValid = false;
      }
      if (!t.nationality) {
        tErrors.nationality = "Nationality is required";
        isValid = false;
      }
      if (!t.passport.trim()) {
        tErrors.passport = "Passport number is required";
        isValid = false;
      }
      if (Object.keys(tErrors).length > 0) {
        newErrors.travelers[t.id] = tErrors;
      }
    });

    // 2. Validate Contact
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail.trim()) {
      newErrors.contactEmail = "Email is required";
      isValid = false;
    } else if (!emailRegex.test(contactEmail)) {
      newErrors.contactEmail = "Please enter a valid email address";
      isValid = false;
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!contactPhone.trim()) {
      newErrors.contactPhone = "Phone number is required";
      isValid = false;
    } else if (!phoneRegex.test(contactPhone)) {
      newErrors.contactPhone = "Phone number must be a valid 10-digit number";
      isValid = false;
    }

    // 3. Validate GST
    if (isGstEnabled) {
      if (!gstNumber.trim()) {
        newErrors.gstNumber = "GST number is required";
        isValid = false;
      } else if (gstNumber.trim().length !== 15) {
        newErrors.gstNumber = "GST number must be 15 characters long";
        isValid = false;
      }
      if (!companyName.trim()) {
        newErrors.companyName = "Company name is required";
        isValid = false;
      }
      if (!companyEmail.trim()) {
        newErrors.companyEmail = "Company email is required";
        isValid = false;
      } else if (!emailRegex.test(companyEmail)) {
        newErrors.companyEmail = "Please enter a valid email address";
        isValid = false;
      }
    }

    // 4. Validate Emergency Contact
    if (!emergencyName.trim()) {
      newErrors.emergencyName = "Emergency contact name is required";
      isValid = false;
    }
    if (!emergencyRelationship) {
      newErrors.emergencyRelationship = "Relationship is required";
      isValid = false;
    }
    if (!emergencyPhone.trim()) {
      newErrors.emergencyPhone = "Emergency phone number is required";
      isValid = false;
    } else if (!phoneRegex.test(emergencyPhone)) {
      newErrors.emergencyPhone = "Phone number must be a valid 10-digit number";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handlePayment = async () => {
    if (!validateForm()) {
      alert("Please fill all required passenger details correctly.");
      return;
    }

    // Note: You must replace this with a valid test key from your Razorpay Dashboard.
    // If the key is invalid or dummy, Razorpay's server will return "Something went wrong" inside the modal.
    const rzpKey = "rzp_test_MJ6kGUsiZlv1c9"; 

    const res = await loadRazorpay();
    if (!res) {
      alert("Razorpay SDK failed to load. Are you online?");
      return;
    }

    const options = {
      key: rzpKey,
      amount: "72000", // $720.00 * 100
      currency: "USD",
      name: "Itinero",
      description: "Flight Booking to DXB",
      image: "/favicon.png",
      handler: function (response) {
        // Payment successful! Navigate to success screen
        navigate('/flights/booking-success');
      },
      prefill: {
        name: travelers[0] ? `${travelers[0].firstName} ${travelers[0].lastName}` : "Guest",
        email: contactEmail,
        contact: contactPhone
      },
      theme: {
        color: "#001439"
      }
    };
    
    const paymentObject = new window.Razorpay(options);
    paymentObject.open();
  };

  const adults = travelers.filter(t => t.type === 'adult');
  const children = travelers.filter(t => t.type === 'child');
  const infants = travelers.filter(t => t.type === 'infant');

  const addTraveler = () => {
    setTravelers([...travelers, {
      id: Date.now(),
      type: activeTab,
      firstName: '',
      lastName: '',
      gender: '',
      dob: '',
      nationality: '',
      passport: ''
    }]);
  };

  const updateTraveler = (id, field, value) => {
    setTravelers(travelers.map(t => t.id === id ? { ...t, [field]: value } : t));
    
    // Clear validation error for this traveler and field if it exists
    if (errors.travelers[id] && errors.travelers[id][field]) {
      setErrors(prev => {
        const updatedTravelerErrs = { ...prev.travelers[id] };
        delete updatedTravelerErrs[field];
        return {
          ...prev,
          travelers: {
            ...prev.travelers,
            [id]: updatedTravelerErrs
          }
        };
      });
    }
  };

  const handleContactEmailChange = (val) => {
    setContactEmail(val);
    if (errors.contactEmail) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.contactEmail;
        return copy;
      });
    }
  };

  const handleContactPhoneChange = (val) => {
    setContactPhone(val);
    if (errors.contactPhone) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.contactPhone;
        return copy;
      });
    }
  };

  const handleGstNumberChange = (val) => {
    setGstNumber(val);
    if (errors.gstNumber) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.gstNumber;
        return copy;
      });
    }
  };

  const handleCompanyNameChange = (val) => {
    setCompanyName(val);
    if (errors.companyName) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.companyName;
        return copy;
      });
    }
  };

  const handleCompanyEmailChange = (val) => {
    setCompanyEmail(val);
    if (errors.companyEmail) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.companyEmail;
        return copy;
      });
    }
  };

  const handleEmergencyNameChange = (val) => {
    setEmergencyName(val);
    if (errors.emergencyName) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.emergencyName;
        return copy;
      });
    }
  };

  const handleEmergencyRelationshipChange = (val) => {
    setEmergencyRelationship(val);
    if (errors.emergencyRelationship) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.emergencyRelationship;
        return copy;
      });
    }
  };

  const handleEmergencyPhoneChange = (val) => {
    setEmergencyPhone(val);
    if (errors.emergencyPhone) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy.emergencyPhone;
        return copy;
      });
    }
  };

  const currentList = activeTab === 'adult' ? adults : activeTab === 'child' ? children : infants;

  return (
    <PageLayout>
      <div className="bg-[#f3f3f3] min-h-screen pb-[50px]">
        
        {/* Hero Section */}
        <div className={overviewStyles.heroSection}>
          <h1 className={overviewStyles.heroTitle}>
            Beyond The Clouds
          </h1>
          <SharedFlightSearchBar />
        </div>

      {/* Main Content */}
      <div className="max-w-[1780px] mx-auto px-4 mt-10 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column - Forms */}
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-[#001439] mb-1">Passenger Information</h2>
            <p className="text-gray-500 text-sm">Please enter the details of all travelers as per their government ID.</p>
          </div>

          {/* Box 1: Traveler Information */}
          <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_15px_30px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#F97211] to-[#E86A10] text-white flex items-center justify-center text-sm font-bold shadow-sm">1</div>
              <h3 className="text-xl font-bold text-[#001439]">Traveler Information</h3>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-50/80 rounded-[14px] p-1.5 mb-8 border border-gray-100/50">
              <button 
                onClick={() => setActiveTab('adult')}
                className={`flex-1 py-2.5 md:py-3 text-sm rounded-[10px] flex items-center justify-center gap-2 transition-all duration-200 ${activeTab === 'adult' ? 'bg-white shadow-sm text-[#F97211] font-bold border border-gray-100' : 'text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100/50'}`}
              >
                <User size={16} /> Adult ({adults.length})
              </button>
              <button 
                onClick={() => setActiveTab('child')}
                className={`flex-1 py-2.5 md:py-3 text-sm rounded-[10px] flex items-center justify-center gap-2 transition-all duration-200 ${activeTab === 'child' ? 'bg-white shadow-sm text-[#F97211] font-bold border border-gray-100' : 'text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100/50'}`}
              >
                <User size={16} /> Child ({children.length})
              </button>
              <button 
                onClick={() => setActiveTab('infant')}
                className={`flex-1 py-2.5 md:py-3 text-sm rounded-[10px] flex items-center justify-center gap-2 transition-all duration-200 ${activeTab === 'infant' ? 'bg-white shadow-sm text-[#F97211] font-bold border border-gray-100' : 'text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100/50'}`}
              >
                <User size={16} /> Infant ({infants.length})
              </button>
            </div>

            {/* Dynamic Traveler Forms */}
            {currentList.map((traveler, index) => {
              const tErrs = errors.travelers[traveler.id] || {};
              return (
                <div key={traveler.id} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-2 mb-4 text-[#001439] font-bold">
                    <User size={18} /> 
                    <span className="capitalize">{traveler.type} {index + 1}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">First Name</label>
                      <input 
                        type="text" 
                        placeholder="Enter first name" 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.firstName ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.firstName} 
                        onChange={(e) => updateTraveler(traveler.id, 'firstName', e.target.value)} 
                      />
                      {tErrs.firstName && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.firstName}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Last Name</label>
                      <input 
                        type="text" 
                        placeholder="Enter last name" 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.lastName ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.lastName} 
                        onChange={(e) => updateTraveler(traveler.id, 'lastName', e.target.value)} 
                      />
                      {tErrs.lastName && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.lastName}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender</label>
                      <select 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.gender ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.gender} 
                        onChange={(e) => updateTraveler(traveler.id, 'gender', e.target.value)}
                      >
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                      {tErrs.gender && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.gender}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date Of Birth</label>
                      <input 
                        type="date" 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.dob ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.dob} 
                        onChange={(e) => updateTraveler(traveler.id, 'dob', e.target.value)} 
                      />
                      {tErrs.dob && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.dob}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nationality</label>
                      <select 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.nationality ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.nationality} 
                        onChange={(e) => updateTraveler(traveler.id, 'nationality', e.target.value)}
                      >
                        <option value="">Select Nationality</option>
                        <option value="us">United States</option>
                        <option value="uk">United Kingdom</option>
                        <option value="in">India</option>
                      </select>
                      {tErrs.nationality && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.nationality}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Passport Number</label>
                      <input 
                        type="text" 
                        placeholder="Enter passport number" 
                        className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${tErrs.passport ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                        value={traveler.passport} 
                        onChange={(e) => updateTraveler(traveler.id, 'passport', e.target.value)} 
                      />
                      {tErrs.passport && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{tErrs.passport}</span>}
                    </div>
                  </div>
                </div>
              );
            })}

            <button 
              onClick={addTraveler}
              className="w-full mt-8 py-3.5 border-2 border-dashed border-[#F97211]/40 text-[#F97211] bg-[#F97211]/5 hover:bg-[#F97211]/10 hover:border-[#F97211] rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300"
            >
              + Add Another Traveler
            </button>
          </div>

          {/* Box 2: Contact Information */}
          <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_15px_30px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#F97211] to-[#E86A10] text-white flex items-center justify-center text-sm font-bold shadow-sm">2</div>
              <h3 className="text-xl font-bold text-[#001439]">Contact Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address</label>
                <input 
                  type="email" 
                  placeholder="Enter email address" 
                  className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.contactEmail ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                  value={contactEmail}
                  onChange={(e) => handleContactEmailChange(e.target.value)}
                />
                {errors.contactEmail && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.contactEmail}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="Enter phone number" 
                  className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.contactPhone ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                  value={contactPhone}
                  onChange={(e) => handleContactPhoneChange(e.target.value)}
                />
                {errors.contactPhone && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.contactPhone}</span>}
              </div>
            </div>
          </div>

          {/* Box 3: GST Information */}
          <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_15px_30px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#F97211] to-[#E86A10] text-white flex items-center justify-center text-sm font-bold shadow-sm">3</div>
                <div>
                  <h3 className="text-xl font-bold text-[#001439] leading-tight">GST Information (optional)</h3>
                  <p className="text-sm text-gray-500 mt-1">Add GST details to get invoice for your business.</p>
                </div>
              </div>
              
              {/* Custom Toggle Switch */}
              <button 
                onClick={() => setIsGstEnabled(!isGstEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isGstEnabled ? 'bg-[#F97211]' : 'bg-gray-200'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${isGstEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
              </button>
            </div>

            {isGstEnabled && (
              <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2 fade-in duration-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">GST Number</label>
                  <input 
                    type="text" 
                    placeholder="Enter GST Number" 
                    className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.gstNumber ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                    value={gstNumber}
                    onChange={(e) => handleGstNumberChange(e.target.value)}
                  />
                  {errors.gstNumber && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.gstNumber}</span>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter company name" 
                    className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.companyName ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                    value={companyName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                  />
                  {errors.companyName && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.companyName}</span>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Company Email</label>
                  <input 
                    type="email" 
                    placeholder="Enter company email" 
                    className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.companyEmail ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                    value={companyEmail}
                    onChange={(e) => handleCompanyEmailChange(e.target.value)}
                  />
                  {errors.companyEmail && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.companyEmail}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Box 4: Emergency Contact Information */}
          <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_15px_30px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#F97211] to-[#E86A10] text-white flex items-center justify-center text-sm font-bold shadow-sm">4</div>
              <h3 className="text-xl font-bold text-[#001439]">Emergency Contact Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  placeholder="Enter Full Name" 
                  className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.emergencyName ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                  value={emergencyName}
                  onChange={(e) => handleEmergencyNameChange(e.target.value)}
                />
                {errors.emergencyName && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.emergencyName}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Relationship</label>
                <select 
                  className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.emergencyRelationship ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                  value={emergencyRelationship}
                  onChange={(e) => handleEmergencyRelationshipChange(e.target.value)}
                >
                  <option value="">Select relationship</option>
                  <option value="spouse">Spouse</option>
                  <option value="parent">Parent</option>
                  <option value="sibling">Sibling</option>
                  <option value="friend">Friend</option>
                </select>
                {errors.emergencyRelationship && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.emergencyRelationship}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="Enter phone number" 
                  className={`w-full px-4 py-3.5 rounded-[12px] border bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#F97211]/15 text-sm font-medium transition-all duration-200 ${errors.emergencyPhone ? 'border-red-500 focus:border-red-500 bg-red-50/10' : 'border-gray-200 focus:border-[#F97211]'}`} 
                  value={emergencyPhone}
                  onChange={(e) => handleEmergencyPhoneChange(e.target.value)}
                />
                {errors.emergencyPhone && <span className="text-red-500 text-[11px] font-semibold mt-1 block">{errors.emergencyPhone}</span>}
              </div>
            </div>
          </div>
          

        </div>

        {/* Right Column - Booking Summary */}
        <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6">
          <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_15px_30px_rgba(0,0,0,0.12)] p-6 md:p-8 sticky top-24">
            <h3 className="text-xl font-bold text-[#001439] mb-8">Booking Summary</h3>
            
            {/* Flight Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#DC2626] rounded-md flex items-center justify-center border border-gray-100">
                  <Plane className="text-white w-6 h-6 rotate-45" />
                </div>
                <div>
                  <div className="font-bold text-[#001439]">Emirates</div>
                  <div className="text-xs text-gray-500">EK 203 • Boeing 777-300ER</div>
                </div>
              </div>
              <span className="bg-green-50 text-green-600 px-2 py-1 rounded text-xs font-bold uppercase">Refundable</span>
            </div>

            {/* Flight Times */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <div className="text-2xl font-black text-[#001439]">08:45</div>
                <div className="font-bold mt-1 text-sm text-[#001439]">JFK</div>
                <div className="text-[10px] text-gray-500 leading-tight mt-1">John F. Kennedy Intl.</div>
              </div>
              <div className="flex flex-col items-center flex-1 px-4">
                <span className="text-[10px] font-semibold text-gray-400 mb-1">7h 20m</span>
                <div className="w-full flex items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#F97211]"></div>
                  <div className="flex-1 h-px border-t border-dashed border-gray-300"></div>
                  <Plane size={12} className="text-[#6C5CE7] mx-1" />
                  <div className="flex-1 h-px border-t border-dashed border-gray-300"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                </div>
                <span className="text-[10px] font-semibold text-green-500 mt-1">Direct</span>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-[#001439]">20:05</div>
                <div className="font-bold mt-1 text-sm text-[#001439]">LHR</div>
                <div className="text-[10px] text-gray-500 leading-tight mt-1">Heathrow Airport</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mb-6 pb-6 border-b border-gray-100">
              <Calendar size={12} /> 12 May, 2026 
              <span className="mx-1">•</span> Economy Class 
              <span className="mx-1">•</span> {travelers.length} Passenger
            </div>

            {/* Fare Summary */}
            <h4 className="font-bold text-[#001439] mb-4">Fare Summary</h4>
            <div className="space-y-3 text-sm mb-6 pb-6 border-b border-gray-100">
              <div className="flex justify-between text-gray-600">
                <span>Base Fare</span>
                <span className="font-semibold text-[#001439]">$520.00</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Airline Charges</span>
                <span className="font-semibold text-[#001439]">$80.00</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Taxes & Fees</span>
                <span className="font-semibold text-[#001439]">$120.00</span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-[#001439] text-lg">Total Fare</span>
              <span className="font-black text-[#001439] text-2xl">$720.00</span>
            </div>

            {/* Points Banner */}
            <div className="bg-[#F0F7FF] rounded-[12px] p-3 flex items-center justify-between mb-6">
              <span className="text-xs text-[#0052CC]">Earn <strong className="font-bold">120 Itinero Points</strong> on this booking</span>
              <span>🎁</span>
            </div>

            <button onClick={handlePayment} className="bg-gradient-to-r from-[#F97211] to-[#E86A10] hover:from-[#E86A10] hover:to-[#D95F0D] text-white w-full py-4 rounded-[12px] font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-[0_10px_25px_rgba(249,114,17,0.4)] mb-6">
              Continue to Payment
            </button>

            {/* Help Section */}
            <div>
              <div className="font-bold text-sm text-[#001439] mb-1">Need Help?</div>
              <div className="text-xs text-gray-500 mb-3">Our travel experts are here for you.</div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <a href="#" className="flex items-center gap-1.5 text-[#001439]"><Phone size={14} /> +1 (800) 555-0199</a>
                <a href="#" className="flex items-center gap-1.5 text-[#F97211]"><Mail size={14} /> Chat with us</a>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
