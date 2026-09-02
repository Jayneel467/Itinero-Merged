import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MapPin, Search, X } from "lucide-react";
import { CURRENCIES, formatMoney, useCurrency } from "@/context/CurrencyContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { MODAL_LANGUAGES, modalSelectionCode } from "@/constants/languages";
import useAirportSuggest from "@/features/flights/hooks/useAirportSuggest";
import {
  COUNTRY_DEFAULTS,
  countryFlagUrl,
  popularHomeAirports,
} from "@/services/homeLocation";
import styles from "./RegionalModal.module.css";

const PASSPORT_OPTIONS = [
  "IN",
  "US",
  "GB",
  "AE",
  "SG",
  "AU",
  "CA",
  "JP",
  "FR",
  "DE",
  "ES",
  "IT",
  "NL",
  "IE",
  "PT",
  "TH",
  "ID",
  "MY",
  "KR",
  "CN",
  "HK",
  "BR",
  "NZ",
  "ZA",
  "TR",
  "SA",
  "MX",
  "PH",
  "VN",
  "NP",
  "LK",
  "BD",
  "PK",
  "NG",
  "KE",
  "EG",
  "CH",
  "AT",
  "BE",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "RU",
  "UA",
  "AR",
  "CL",
  "CO",
  "PE",
  "IL",
  "QA",
  "KW",
  "BH",
  "OM",
];

const PASSPORT_LABELS = {
  ...Object.fromEntries(
    Object.entries(COUNTRY_DEFAULTS).map(([cc, meta]) => [cc, meta.label])
  ),
  MX: "Mexico",
  PH: "Philippines",
  VN: "Vietnam",
  NP: "Nepal",
  LK: "Sri Lanka",
  BD: "Bangladesh",
  PK: "Pakistan",
  NG: "Nigeria",
  KE: "Kenya",
  EG: "Egypt",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  RU: "Russia",
  UA: "Ukraine",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  PE: "Peru",
  IL: "Israel",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

export default function RegionalModal({
  isOpen,
  onClose,
  defaultTab = "language",
  selectedLanguage,
  onSelectLanguage,
  selectedCurrency,
  onSelectCurrency,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [airportQuery, setAirportQuery] = useState("");
  const [passportQuery, setPassportQuery] = useState("");
  const [languageQuery, setLanguageQuery] = useState("");
  const [currencyQuery, setCurrencyQuery] = useState("");
  const { convert, fxDate, currency: activeCurrency } = useCurrency();
  const home = useHomeLocationOptional();
  const popular = useMemo(() => popularHomeAirports(), []);
  const { airports: suggested, isLoading: airportSuggestLoading } = useAirportSuggest(
    airportQuery,
    { enabled: isOpen && activeTab === "location" }
  );

  const passportResults = useMemo(() => {
    const q = passportQuery.trim().toLowerCase();
    const rows = PASSPORT_OPTIONS.map((cc) => ({
      cc,
      label: PASSPORT_LABELS[cc] || COUNTRY_DEFAULTS[cc]?.label || cc,
      flag: countryFlagUrl(cc),
    }));
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = `${row.cc} ${row.label}`.toLowerCase();
      return blob.includes(q);
    });
  }, [passportQuery]);

  const languageResults = useMemo(() => {
    const q = languageQuery.trim().toLowerCase();
    if (!q) return MODAL_LANGUAGES;
    return MODAL_LANGUAGES.filter((lang) => {
      const blob = `${lang.code} ${lang.name}`.toLowerCase();
      return blob.includes(q);
    });
  }, [languageQuery]);

  const currencyResults = useMemo(() => {
    const q = currencyQuery.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((curr) => {
      const blob = `${curr.code} ${curr.name} ${curr.symbol}`.toLowerCase();
      return blob.includes(q);
    });
  }, [currencyQuery]);

  const compareCurrency = String(selectedCurrency || activeCurrency || "USD").toUpperCase();

  const airportResults = useMemo(() => {
    const q = airportQuery.trim();
    if (!q) return popular;
    const seen = new Set();
    const out = [];
    for (const a of suggested || []) {
      const code = String(a?.code || "").toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(a);
    }
    const needle = q.toLowerCase();
    for (const a of popular) {
      const code = String(a?.code || "").toUpperCase();
      if (!code || seen.has(code)) continue;
      const blob = `${a.code} ${a.city} ${a.name} ${a.state || ""} ${(a.aliases || []).join(" ")}`.toLowerCase();
      if (blob.includes(needle)) {
        seen.add(code);
        out.push(a);
      }
    }
    return out;
  }, [airportQuery, popular, suggested]);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setAirportQuery("");
      setPassportQuery("");
      setLanguageQuery("");
      setCurrencyQuery("");
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "location" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("location")}
            >
              Home & passport
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "language" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("language")}
            >
              Language
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "currency" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("currency")}
            >
              Currency
            </button>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === "location" && home ? (
            <div className={styles.locationPane}>
              <p className={styles.locationLead}>
                Passport nationality drives visa tips. Home airport drives fares. Neither
                defaults to India.
              </p>
              <div className={styles.locationSummary}>
                {home.countryFlag ? (
                  <img
                    src={home.countryFlag}
                    alt=""
                    style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <MapPin size={18} />
                )}
                <div>
                  <strong>
                    {home.countryName || home.originLabel || "Select country"}
                    {home.airportCode ? ` (${home.airportCode})` : ""}
                  </strong>
                  <span>
                    {home.hasPassport
                      ? home.passportLabel
                      : "Passport not set - pick below"}
                    {home.city ? ` · ${home.city}` : ""}
                  </span>
                </div>
              </div>

              <h4 className={styles.sectionTitle}>Passport nationality</h4>
              <label className={styles.searchWrap}>
                <Search size={18} className={styles.searchIcon} aria-hidden />
                <input
                  type="search"
                  className={styles.searchInput}
                  value={passportQuery}
                  onChange={(e) => setPassportQuery(e.target.value)}
                  placeholder="Search country or code (e.g. Australia, AU)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search passport nationality"
                />
                {passportQuery ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setPassportQuery("")}
                    aria-label="Clear passport search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </label>
              {!passportResults.length ? (
                <p className={styles.searchHint}>No countries match “{passportQuery.trim()}”.</p>
              ) : (
                <div className={styles.grid}>
                  {passportResults.map((row) => {
                    const selected = home.passportCountry === row.cc;
                    return (
                      <button
                        key={row.cc}
                        type="button"
                        className={`${styles.item} ${selected ? styles.itemSelected : ""}`}
                        onClick={() => {
                          home.setPassportCountry(row.cc);
                          setPassportQuery("");
                        }}
                      >
                        <div className={styles.itemInner}>
                          {row.flag ? (
                            <img src={row.flag} alt="" className={styles.flag} loading="lazy" />
                          ) : null}
                          <span className={styles.name}>{row.label}</span>
                        </div>
                        {selected ? <Check size={18} className={styles.checkmark} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}

              <h4 className={styles.sectionTitle}>Home airport</h4>
              <label className={styles.searchWrap}>
                <Search size={18} className={styles.searchIcon} aria-hidden />
                <input
                  type="search"
                  className={styles.searchInput}
                  value={airportQuery}
                  onChange={(e) => setAirportQuery(e.target.value)}
                  placeholder="Search city or airport code (e.g. Paris, CDG)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search home airport"
                />
                {airportQuery ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setAirportQuery("")}
                    aria-label="Clear airport search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </label>
              {airportSuggestLoading && airportQuery.trim().length >= 2 ? (
                <p className={styles.searchHint}>Searching airports…</p>
              ) : null}
              {!airportResults.length ? (
                <p className={styles.searchHint}>No airports match “{airportQuery.trim()}”.</p>
              ) : (
                <div className={styles.grid}>
                  {airportResults.map((a) => {
                    const selected = home.airportCode === a.code;
                    return (
                      <button
                        key={a.code}
                        type="button"
                        className={`${styles.item} ${selected ? styles.itemSelected : ""}`}
                        onClick={() => {
                          home.setHomeAirport(a);
                          setAirportQuery("");
                        }}
                      >
                        <div className={styles.itemInner}>
                          <div className={styles.currencySymbol}>{a.code}</div>
                          <div>
                            <div className={styles.name}>{a.city}</div>
                            <div className={styles.subtext}>{a.name}</div>
                          </div>
                        </div>
                        {selected ? <Check size={18} className={styles.checkmark} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={styles.locationActions}>
                <button type="button" className={styles.doneBtn} onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : activeTab === "language" ? (
            <div className={styles.locationPane}>
              <label className={styles.searchWrap}>
                <Search size={18} className={styles.searchIcon} aria-hidden />
                <input
                  type="search"
                  className={styles.searchInput}
                  value={languageQuery}
                  onChange={(e) => setLanguageQuery(e.target.value)}
                  placeholder="Search language (e.g. Français, Japanese)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search language"
                />
                {languageQuery ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setLanguageQuery("")}
                    aria-label="Clear language search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </label>
              {!languageResults.length ? (
                <p className={styles.searchHint}>No languages match “{languageQuery.trim()}”.</p>
              ) : (
                <div className={styles.grid}>
                  {languageResults.map((lang) => {
                    const isSelected = modalSelectionCode(selectedLanguage) === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        className={`${styles.item} ${isSelected ? styles.itemSelected : ""}`}
                        onClick={() => {
                          onSelectLanguage(lang.code, lang.flag);
                          onClose();
                        }}
                      >
                        <div className={styles.itemInner}>
                          <img
                            src={lang.flag}
                            alt={lang.name}
                            className={styles.flag}
                            loading="lazy"
                          />
                          <span className={styles.name}>{lang.name}</span>
                        </div>
                        {isSelected ? <Check size={18} className={styles.checkmark} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.locationPane}>
              <label className={styles.searchWrap}>
                <Search size={18} className={styles.searchIcon} aria-hidden />
                <input
                  type="search"
                  className={styles.searchInput}
                  value={currencyQuery}
                  onChange={(e) => setCurrencyQuery(e.target.value)}
                  placeholder="Search currency (e.g. USD, Euro, Yen)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search currency"
                />
                {currencyQuery ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setCurrencyQuery("")}
                    aria-label="Clear currency search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </label>
              <p className={styles.searchHint}>
                Mid-market rates vs {compareCurrency}
                {fxDate ? ` · ${fxDate}` : ""}
              </p>
              {!currencyResults.length ? (
                <p className={styles.searchHint}>No currencies match “{currencyQuery.trim()}”.</p>
              ) : (
                <div className={styles.grid}>
                  {currencyResults.map((curr) => {
                    const isSelected = selectedCurrency === curr.code;
                    const converted =
                      curr.code === compareCurrency
                        ? null
                        : convert(1, curr.code, compareCurrency);
                    return (
                      <button
                        key={curr.code}
                        type="button"
                        className={`${styles.item} ${isSelected ? styles.itemSelected : ""}`}
                        onClick={() => {
                          onSelectCurrency(curr.code, curr.symbol);
                          try {
                            localStorage.setItem("itinero_home_currency_synced_v1", curr.code);
                          } catch {
                            /* ignore */
                          }
                          onClose();
                        }}
                      >
                        <div className={styles.itemInner}>
                          <div className={styles.currencySymbol}>{curr.symbol}</div>
                          <div>
                            <div className={styles.name}>{curr.code}</div>
                            <div className={styles.subtext}>
                              {curr.name}
                              {converted != null
                                ? ` · 1 ${curr.code} ≈ ${formatMoney(converted, compareCurrency, {
                                    maximumFractionDigits: 4,
                                  })}`
                                : fxDate
                                  ? ` · mid-market ${fxDate}`
                                  : ""}
                            </div>
                          </div>
                        </div>
                        {isSelected ? <Check size={18} className={styles.checkmark} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
