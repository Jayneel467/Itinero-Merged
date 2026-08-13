import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plane,
  Calendar,
  User,
  Mail,
  Phone,
  ShieldCheck,
  Check,
  Globe2,
  CreditCard,
  Users,
  Briefcase,
  Luggage,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildPassengerPageContext } from "@/features/vero/utils/pageContext";
import { flightsSearchPath } from "@/features/vero/utils/pageFilterIntent";
import { findAirportByCode } from "@/constants/airports";
import {
  inferAirlineCode,
  canonicalizeAirlineName,
} from "./utils/airlineIdentity";
import { saveFlightCheckout, checkoutAmount } from "./utils/flightCheckout";
import { readFlightSessionId } from "./utils/persistSelectedFlight";
import AirlineMark from "./components/AirlineMark";
import styles from "./PassengerInfoPage.module.css";

const NATIONALITIES = [
  { value: "in", label: "India" },
  { value: "ae", label: "United Arab Emirates" },
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "sg", label: "Singapore" },
  { value: "au", label: "Australia" },
  { value: "ca", label: "Canada" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "sa", label: "Saudi Arabia" },
  { value: "om", label: "Oman" },
  { value: "qa", label: "Qatar" },
  { value: "bh", label: "Bahrain" },
  { value: "kw", label: "Kuwait" },
  { value: "np", label: "Nepal" },
  { value: "bd", label: "Bangladesh" },
  { value: "lk", label: "Sri Lanka" },
  { value: "other", label: "Other" },
];

function readSelectedFlight() {
  try {
    return JSON.parse(sessionStorage.getItem("itinero_selected_flight") || "null");
  } catch {
    return null;
  }
}

function Field({ label, error, icon: Icon, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={`${styles.inputWrap} ${error ? styles.inputWrapError : ""}`}>
        {Icon ? <Icon size={16} className={styles.inputIcon} /> : null}
        {children}
      </div>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}

export default function PassengerInfoPage() {
  const { currency: appCurrency, formatMoney } = useCurrency();
  const { setPageContext, clearPageContext } = useVeroUi();
  const [selectedFlight, setSelectedFlight] = useState(readSelectedFlight);

  const [travelers, setTravelers] = useState([
    {
      id: 1,
      type: "adult",
      firstName: "",
      lastName: "",
      gender: "",
      dob: "",
      nationality: "in",
      passport: "",
    },
  ]);
  const [activeTab, setActiveTab] = useState("adult");
  const [isGstEnabled, setIsGstEnabled] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [errors, setErrors] = useState({ travelers: {} });
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = { travelers: {} };
    let isValid = true;

    travelers.forEach((t) => {
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

  const goToPayment = () => {
    if (!validateForm()) {
      alert("Please fill all required passenger details correctly.");
      return;
    }
    const flight = selectedFlight || readSelectedFlight();
    if (!flight || checkoutAmount(flight) <= 0) {
      alert("No live fare on this booking. Go back and pick a flight again.");
      return;
    }
    saveFlightCheckout({
      flight,
      sessionId: readFlightSessionId() || undefined,
      travelers,
      contact: { email: contactEmail.trim(), phone: contactPhone.trim() },
      emergency: {
        name: emergencyName.trim(),
        relationship: emergencyRelationship,
        phone: emergencyPhone.trim(),
      },
      gst: isGstEnabled
        ? {
            enabled: true,
            number: gstNumber.trim(),
            companyName: companyName.trim(),
            companyEmail: companyEmail.trim(),
          }
        : { enabled: false },
    });
    navigate("/flights/payment");
  };

  const adults = travelers.filter((t) => t.type === "adult");
  const children = travelers.filter((t) => t.type === "child");
  const infants = travelers.filter((t) => t.type === "infant");

  useEffect(() => {
    setSelectedFlight(readSelectedFlight());
  }, []);

  useEffect(() => {
    setPageContext(buildPassengerPageContext(selectedFlight));
    return () => clearPageContext();
  }, [selectedFlight, setPageContext, clearPageContext]);

  const summary = useMemo(() => {
    const f = selectedFlight;
    if (!f) return null;
    const airlineName = canonicalizeAirlineName(
      f.airline?.name || (typeof f.airline === "string" ? f.airline : ""),
      f.airline?.code
    );
    const flightNo = f.flightNumber || f.flight_number || "";
    const airlineCode = inferAirlineCode(airlineName, flightNo, f.airline?.code);
    const origin = String(f.departure?.airport || f.origin || "").toUpperCase();
    const dest = String(f.arrival?.airport || f.destination || "").toUpperCase();
    const originMeta = findAirportByCode(origin);
    const destMeta = findAirportByCode(dest);
    const depTime = f.departure?.time || "--:--";
    const arrTime = f.arrival?.time || "--:--";
    const depDate =
      f.departure?.date ||
      (f.departureAt
        ? new Date(f.departureAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "");
    const currencyCode =
      String(f.currencyCode || f.currency || appCurrency || "INR")
        .replace(/[^A-Z]/gi, "")
        .toUpperCase()
        .slice(0, 3) || "INR";
    const price = Number(f.price) || 0;
    const layover = Array.isArray(f.layoverCodes) ? f.layoverCodes.filter(Boolean) : [];
    const stopsCount =
      typeof f.stopsCount === "number"
        ? f.stopsCount
        : layover.length || (/non[\s-]?stop|direct/i.test(String(f.stops || "")) ? 0 : null);
    const stopLabel =
      stopsCount === 0
        ? "Non-stop"
        : stopsCount === 1
          ? layover[0]
            ? `1 stop · ${layover[0]}`
            : "1 stop"
          : stopsCount > 1
            ? `${stopsCount} stops`
            : f.stops || "-";
    const bag = f.baggage || {};
    return {
      airlineName,
      airlineCode,
      logo: f.airline?.logo || f.logo || "",
      flightNo,
      origin,
      dest,
      originCity: originMeta?.city || origin,
      destCity: destMeta?.city || dest,
      originName: originMeta?.name || originMeta?.city || origin,
      destName: destMeta?.name || destMeta?.city || dest,
      depTime,
      arrTime,
      depDate,
      duration: f.duration || "-",
      stopLabel,
      cabin: f.cabin || f.fare_family || "Economy",
      fareFamily: f.fare_family || f.cabin || "Economy",
      cabinBag: bag.cabin || null,
      checkedBag: bag.checked || null,
      refundable: f.refundable,
      has_refund_fee: f.has_refund_fee === true,
      terms_summary: Array.isArray(f.terms_summary) ? f.terms_summary : null,
      currencyCode,
      price,
      priceLabel: formatMoney(price, currencyCode),
    };
  }, [selectedFlight, appCurrency, formatMoney]);

  const filledCount = useMemo(() => {
    let n = 0;
    const t = travelers[0];
    if (t?.firstName && t?.lastName && t?.gender && t?.dob && t?.nationality && t?.passport) n += 1;
    if (contactEmail && contactPhone) n += 1;
    if (emergencyName && emergencyRelationship && emergencyPhone) n += 1;
    if (!isGstEnabled || (gstNumber && companyName && companyEmail)) n += 1;
    return n;
  }, [
    travelers,
    contactEmail,
    contactPhone,
    emergencyName,
    emergencyRelationship,
    emergencyPhone,
    isGstEnabled,
    gstNumber,
    companyName,
    companyEmail,
  ]);

  const addTraveler = () => {
    setTravelers([
      ...travelers,
      {
        id: Date.now(),
        type: activeTab,
        firstName: "",
        lastName: "",
        gender: "",
        dob: "",
        nationality: "in",
        passport: "",
      },
    ]);
  };

  const updateTraveler = (id, field, value) => {
    setTravelers(travelers.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    if (errors.travelers[id] && errors.travelers[id][field]) {
      setErrors((prev) => {
        const updatedTravelerErrs = { ...prev.travelers[id] };
        delete updatedTravelerErrs[field];
        return {
          ...prev,
          travelers: { ...prev.travelers, [id]: updatedTravelerErrs },
        };
      });
    }
  };

  const clearError = (key) => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const goChangeFlight = () => {
    if (summary?.origin && summary?.dest) {
      navigate(
        flightsSearchPath({
          origin: summary.origin,
          destination: summary.dest,
          trip: "oneway",
          adults: travelers.length || 1,
          cabin: summary.cabin || "Economy",
        })
      );
      return;
    }
    navigate("/flights");
  };

  const currentList = activeTab === "adult" ? adults : activeTab === "child" ? children : infants;

  return (
    <PageLayout>
      <div className={styles.page}>
        <div className={styles.stepperWrap}>
          <div className={styles.stepper}>
            <div className={`${styles.step} ${styles.stepDone}`}>
              <span className={`${styles.stepNum} ${styles.stepNumDone}`}>
                <Check size={12} strokeWidth={3} />
              </span>
              Search
            </div>
            <span className={styles.stepSep}>→</span>
            <div className={`${styles.step} ${styles.stepDone}`}>
              <span className={`${styles.stepNum} ${styles.stepNumDone}`}>
                <Check size={12} strokeWidth={3} />
              </span>
              Select flight
            </div>
            <span className={styles.stepSep}>→</span>
            <div className={`${styles.step} ${styles.stepActive}`}>
              <span className={`${styles.stepNum} ${styles.stepNumActive}`}>3</span>
              Passengers
            </div>
            <span className={styles.stepSep}>→</span>
            <div className={styles.step}>
              <span className={styles.stepNum}>4</span>
              Payment
            </div>
          </div>
        </div>

        <div className={styles.layout}>
          <div className={styles.left}>
            <div className={styles.headerRow}>
              <div>
                <h1 className={styles.title}>Passenger details</h1>
                <p className={styles.subtitle}>
                  Enter names exactly as they appear on the passport / government ID.
                </p>
              </div>
              <div className={styles.progressHint}>{filledCount}/4 sections ready</div>
            </div>

            {summary ? (
              <div className={styles.recap}>
                <div className={styles.recapAirline}>
                  <AirlineMark
                    name={summary.airlineName}
                    code={summary.airlineCode}
                    logo={summary.logo}
                    flightNumber={summary.flightNo}
                    size={52}
                  />
                  <div>
                    <div className={styles.recapName}>{summary.airlineName}</div>
                    <div className={styles.recapCode}>
                      {summary.flightNo || summary.airlineCode || "Live fare"}
                    </div>
                  </div>
                </div>
                <div className={styles.recapRoute}>
                  <div>
                    <div className={styles.recapTime}>{summary.depTime}</div>
                    <div className={styles.recapAirport}>{summary.origin}</div>
                    <div className={styles.recapCity}>{summary.originCity}</div>
                  </div>
                  <div className={styles.recapMid}>
                    <div className={styles.recapDur}>{summary.duration}</div>
                    <div className={styles.recapLine}>
                      <Plane size={12} color="#6C5CE7" style={{ margin: "0 4px" }} />
                    </div>
                    <div className={styles.recapStop}>{summary.stopLabel}</div>
                  </div>
                  <div>
                    <div className={styles.recapTime}>{summary.arrTime}</div>
                    <div className={styles.recapAirport}>{summary.dest}</div>
                    <div className={styles.recapCity}>{summary.destCity}</div>
                  </div>
                </div>
                <div className={styles.recapMeta}>
                  <div className={styles.pills}>
                    <span className={`${styles.pill} ${styles.pillLive}`}>Live fare</span>
                    <span className={`${styles.pill} ${styles.pillFare}`}>{summary.fareFamily}</span>
                    {summary.cabinBag ? (
                      <span className={styles.pill}>
                        <Luggage size={11} style={{ display: "inline", marginRight: 4 }} />
                        Cabin {summary.cabinBag}
                      </span>
                    ) : null}
                    {summary.checkedBag ? (
                      <span className={styles.pill}>
                        <Briefcase size={11} style={{ display: "inline", marginRight: 4 }} />
                        Check-in {summary.checkedBag}
                      </span>
                    ) : null}
                    {summary.refundable === true &&
                    summary.has_refund_fee !== true &&
                    !(Array.isArray(summary.terms_summary) &&
                      summary.terms_summary.some((line) =>
                        /fees?\s+may\s+vary|fee\s+varies|penalty|with\s+fee/i.test(String(line || ""))
                      )) ? (
                      <span className={styles.pill}>Refundable</span>
                    ) : null}
                  </div>
                  <button type="button" className={styles.changeBtn} onClick={goChangeFlight}>
                    Change flight
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.secure}>
              <ShieldCheck size={18} />
              Your passport and contact details stay encrypted and are only used for this booking.
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  <span className={styles.num}>1</span>
                  <div>
                    <h3>Traveler information</h3>
                    <p className={styles.cardHint}>One adult ticket on this fare</p>
                  </div>
                </div>
              </div>

              <div className={styles.tabs}>
                <button
                  type="button"
                  className={`${styles.tab} ${activeTab === "adult" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("adult")}
                >
                  <User size={15} /> Adult ({adults.length})
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${activeTab === "child" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("child")}
                >
                  <User size={15} /> Child ({children.length})
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${activeTab === "infant" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("infant")}
                >
                  <User size={15} /> Infant ({infants.length})
                </button>
              </div>

              {currentList.map((traveler, index) => {
                const tErrs = errors.travelers[traveler.id] || {};
                return (
                  <div key={traveler.id} style={{ marginBottom: 20 }}>
                    <div className={styles.travelerLabel}>
                      <User size={16} />
                      <span className="capitalize">
                        {traveler.type} {index + 1}
                      </span>
                    </div>
                    <div className={styles.grid3} style={{ marginBottom: 14 }}>
                      <Field label="First name" error={tErrs.firstName} icon={User}>
                        <input
                          type="text"
                          placeholder="As on passport"
                          value={traveler.firstName}
                          onChange={(e) => updateTraveler(traveler.id, "firstName", e.target.value)}
                        />
                      </Field>
                      <Field label="Last name" error={tErrs.lastName} icon={User}>
                        <input
                          type="text"
                          placeholder="As on passport"
                          value={traveler.lastName}
                          onChange={(e) => updateTraveler(traveler.id, "lastName", e.target.value)}
                        />
                      </Field>
                      <Field label="Gender" error={tErrs.gender} icon={Users}>
                        <select
                          value={traveler.gender}
                          onChange={(e) => updateTraveler(traveler.id, "gender", e.target.value)}
                        >
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other / unspecified</option>
                        </select>
                      </Field>
                    </div>
                    <div className={styles.grid3}>
                      <Field label="Date of birth" error={tErrs.dob} icon={Calendar}>
                        <input
                          type="date"
                          value={traveler.dob}
                          onChange={(e) => updateTraveler(traveler.id, "dob", e.target.value)}
                        />
                      </Field>
                      <Field label="Nationality" error={tErrs.nationality} icon={Globe2}>
                        <select
                          value={traveler.nationality}
                          onChange={(e) => updateTraveler(traveler.id, "nationality", e.target.value)}
                        >
                          <option value="">Select nationality</option>
                          {NATIONALITIES.map((n) => (
                            <option key={n.value} value={n.value}>
                              {n.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Passport number" error={tErrs.passport} icon={CreditCard}>
                        <input
                          type="text"
                          placeholder="Passport / ID number"
                          value={traveler.passport}
                          onChange={(e) => updateTraveler(traveler.id, "passport", e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}

              <button type="button" className={styles.addBtn} onClick={addTraveler}>
                + Add another traveler
              </button>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  <span className={styles.num}>2</span>
                  <div>
                    <h3>Contact information</h3>
                    <p className={styles.cardHint}>E-ticket and airline updates go here</p>
                  </div>
                </div>
              </div>
              <div className={styles.grid2}>
                <Field label="Email address" error={errors.contactEmail} icon={Mail}>
                  <input
                    type="email"
                    placeholder="name@email.com"
                    value={contactEmail}
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      clearError("contactEmail");
                    }}
                  />
                </Field>
                <Field label="Phone number" error={errors.contactPhone} icon={Phone}>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    value={contactPhone}
                    onChange={(e) => {
                      setContactPhone(e.target.value);
                      clearError("contactPhone");
                    }}
                  />
                </Field>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  <span className={styles.num}>3</span>
                  <div>
                    <h3>GST information (optional)</h3>
                    <p className={styles.cardHint}>Add GST to get a business invoice</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${isGstEnabled ? styles.toggleOn : ""}`}
                  onClick={() => setIsGstEnabled(!isGstEnabled)}
                  aria-pressed={isGstEnabled}
                >
                  <span className={styles.knob} />
                </button>
              </div>
              {isGstEnabled ? (
                <div className={styles.grid3}>
                  <Field label="GST number" error={errors.gstNumber} icon={CreditCard}>
                    <input
                      type="text"
                      placeholder="15-character GSTIN"
                      value={gstNumber}
                      onChange={(e) => {
                        setGstNumber(e.target.value);
                        clearError("gstNumber");
                      }}
                    />
                  </Field>
                  <Field label="Company name" error={errors.companyName} icon={Briefcase}>
                    <input
                      type="text"
                      placeholder="Registered company"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        clearError("companyName");
                      }}
                    />
                  </Field>
                  <Field label="Company email" error={errors.companyEmail} icon={Mail}>
                    <input
                      type="email"
                      placeholder="accounts@company.com"
                      value={companyEmail}
                      onChange={(e) => {
                        setCompanyEmail(e.target.value);
                        clearError("companyEmail");
                      }}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  <span className={styles.num}>4</span>
                  <div>
                    <h3>Emergency contact</h3>
                    <p className={styles.cardHint}>Someone not travelling on this ticket</p>
                  </div>
                </div>
              </div>
              <div className={styles.grid3}>
                <Field label="Full name" error={errors.emergencyName} icon={User}>
                  <input
                    type="text"
                    placeholder="Emergency contact name"
                    value={emergencyName}
                    onChange={(e) => {
                      setEmergencyName(e.target.value);
                      clearError("emergencyName");
                    }}
                  />
                </Field>
                <Field label="Relationship" error={errors.emergencyRelationship} icon={Users}>
                  <select
                    value={emergencyRelationship}
                    onChange={(e) => {
                      setEmergencyRelationship(e.target.value);
                      clearError("emergencyRelationship");
                    }}
                  >
                    <option value="">Select relationship</option>
                    <option value="spouse">Spouse</option>
                    <option value="parent">Parent</option>
                    <option value="sibling">Sibling</option>
                    <option value="child">Child</option>
                    <option value="friend">Friend</option>
                  </select>
                </Field>
                <Field label="Phone number" error={errors.emergencyPhone} icon={Phone}>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    value={emergencyPhone}
                    onChange={(e) => {
                      setEmergencyPhone(e.target.value);
                      clearError("emergencyPhone");
                    }}
                  />
                </Field>
              </div>
            </div>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.summary}>
              <h3 className={styles.summaryTitle}>Booking summary</h3>
              {!summary ? (
                <p className={styles.empty}>No flight selected. Go back to search and pick a fare.</p>
              ) : (
                <>
                  <div className={styles.summaryAirline}>
                    <AirlineMark
                      name={summary.airlineName}
                      code={summary.airlineCode}
                      logo={summary.logo}
                      flightNumber={summary.flightNo}
                      size={48}
                    />
                    <div>
                      <div className={styles.summaryName}>{summary.airlineName}</div>
                      <div className={styles.summaryFlight}>
                        {summary.flightNo || summary.airlineCode} · {summary.fareFamily}
                      </div>
                    </div>
                  </div>
                  <div className={styles.summaryRoute}>
                    <div>
                      <div className={styles.summaryAirport}>{summary.origin}</div>
                      <div className={styles.summaryCity}>{summary.originCity}</div>
                      <div className={styles.summaryCity}>{summary.depTime}</div>
                    </div>
                    <div className={styles.summaryMid}>
                      {summary.duration}
                      <div>{summary.stopLabel}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className={styles.summaryAirport}>{summary.dest}</div>
                      <div className={styles.summaryCity}>{summary.destCity}</div>
                      <div className={styles.summaryCity}>{summary.arrTime}</div>
                    </div>
                  </div>
                  <div className={styles.metaRow}>
                    <span>
                      <Calendar size={12} /> {summary.depDate || "Date TBC"}
                    </span>
                    <span>
                      <Users size={12} /> {travelers.length} pax
                    </span>
                    {summary.cabinBag ? (
                      <span>
                        <Luggage size={12} /> Cabin {summary.cabinBag}
                      </span>
                    ) : null}
                    {summary.checkedBag ? (
                      <span>
                        <Briefcase size={12} /> {summary.checkedBag}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.fareRow}>
                    <span>Live fare</span>
                    <span>{summary.priceLabel}</span>
                  </div>
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalPrice}>{summary.priceLabel}</span>
                  </div>
                  <div className={styles.taxNote}>Inclusive of taxes where shown by the airline</div>
                </>
              )}
              <div className={styles.points}>
                <span>
                  Earn <strong>120 Itinero Points</strong> on this booking
                </span>
                <span>🎁</span>
              </div>
              <button type="button" className={styles.payBtn} onClick={goToPayment}>
                Continue to payment
              </button>
              <div className={styles.help}>
                <div className={styles.helpTitle}>Need help?</div>
                <div className={styles.helpText}>Our travel experts can finish this booking with you.</div>
                <div className={styles.helpLinks}>
                  <a href="tel:+18005550199">
                    <Phone size={14} /> +1 (800) 555-0199
                  </a>
                  <a href="#vero">
                    <Mail size={14} /> Chat with Vero
                  </a>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
