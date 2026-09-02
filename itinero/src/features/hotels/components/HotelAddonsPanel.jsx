import React, { useEffect, useMemo, useState } from "react";
import { Car, Smartphone } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { hotelService } from "@/features/hotels/services/hotelService";
import styles from "./HotelAddonsPanel.module.css";

const UBER_OPTIONS_USD = [0, 10, 20, 30, 40, 50];

function shiftDate(iso, days) {
  if (!iso) return "";
  try {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

function inferCountryCode(hotel) {
  const cc =
    hotel?.countryCode ||
    hotel?.country_code ||
    hotel?.country ||
    hotel?.address?.countryCode ||
    "";
  const raw = String(cc).trim().toUpperCase();
  if (raw.length === 2) return raw;
  if (raw === "INDIA") return "IN";
  if (raw === "UNITED STATES" || raw === "USA") return "US";
  if (raw === "SPAIN") return "ES";
  if (raw === "UNITED KINGDOM" || raw === "UK") return "GB";
  return "IN";
}

export default function HotelAddonsPanel({
  hotel,
  checkIn,
  checkOut,
  value,
  onChange,
  disabled = false,
}) {
  const { formatFrom } = useCurrency();
  const countryCode = useMemo(() => inferCountryCode(hotel), [hotel]);
  const [packages, setPackages] = useState([]);
  const [loadingEsim, setLoadingEsim] = useState(false);
  const [esimError, setEsimError] = useState("");

  const uberUsd = Number(value?.uberUsd || 0);
  const esimPackageId = value?.esimPackageId ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoadingEsim(true);
    setEsimError("");
    hotelService
      .getEsimPackages(countryCode)
      .then((res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setPackages([]);
          setEsimError(res?.message || "eSIM plans unavailable for this destination.");
          return;
        }
        setPackages(res.packages || []);
      })
      .finally(() => {
        if (!cancelled) setLoadingEsim(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  const esimStart = shiftDate(checkIn, -1);
  const esimEnd = shiftDate(checkOut, 1);

  const emit = (next) => {
    const pkg = packages.find((p) => Number(p.package_id) === Number(next.esimPackageId));
    const addons = [];
    if (next.uberUsd > 0) {
      addons.push({
        type: "uber",
        valueUsd: Number(next.uberUsd),
        priceUsd: Number(next.uberUsd),
        title: `Uber ride credit ($${next.uberUsd})`,
      });
    }
    if (next.esimPackageId && pkg) {
      const priceVal = Number(pkg.calculated_price || pkg.price || 0);
      addons.push({
        type: "esim",
        packageId: pkg.package_id,
        destinationCode: countryCode,
        calculatedPrice: priceVal,
        priceUsd: priceVal,
        valueUsd: priceVal,
        name: pkg.name || `${pkg.validity_days || ""} Days eSIM`,
        validityDays: pkg.validity_days,
        startDate: esimStart,
        endDate: esimEnd,
      });
    }
    onChange?.({ ...next, addons });
  };

  return (
    <section className={styles.panel} aria-label="Trip add-ons">
      <h3 className={styles.title}>Trip add-ons</h3>
      <p className={styles.lead}>Optional extras bundled into your hotel payment (USD rates, shown converted).</p>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <Car size={18} aria-hidden />
          <strong>Uber ride credit</strong>
        </div>
        <p className={styles.hint}>Airport ↔ hotel rides. Non-refundable. Added to checkout total.</p>
        <div className={styles.chips}>
          {UBER_OPTIONS_USD.map((usd) => (
            <button
              key={usd}
              type="button"
              disabled={disabled}
              className={`${styles.chip} ${uberUsd === usd ? styles.chipActive : ""}`}
              onClick={() => emit({ uberUsd: usd, esimPackageId })}
            >
              {usd === 0 ? "None" : `$${usd}`}
            </button>
          ))}
        </div>
        {uberUsd > 0 ? (
          <p className={styles.priceLine}>
            Uber credit: ~{formatFrom(uberUsd, "USD")} ({uberUsd} USD)
          </p>
        ) : null}
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <Smartphone size={18} aria-hidden />
          <strong>eSIM data</strong>
        </div>
        <p className={styles.hint}>
          Stay connected in {countryCode}. Active {esimStart} → {esimEnd}.
        </p>
        {loadingEsim ? <p className={styles.hint}>Loading plans…</p> : null}
        {esimError ? <p className={styles.warn}>{esimError}</p> : null}
        {!loadingEsim && packages.length ? (
          <div className={styles.esimList}>
            <button
              type="button"
              disabled={disabled}
              className={`${styles.esimRow} ${!esimPackageId ? styles.esimActive : ""}`}
              onClick={() => emit({ uberUsd, esimPackageId: null })}
            >
              <span>No eSIM</span>
            </button>
            {packages.slice(0, 6).map((pkg) => (
              <button
                key={pkg.package_id}
                type="button"
                disabled={disabled}
                className={`${styles.esimRow} ${
                  Number(esimPackageId) === Number(pkg.package_id) ? styles.esimActive : ""
                }`}
                onClick={() => emit({ uberUsd, esimPackageId: pkg.package_id })}
              >
                <span>
                  {pkg.name} · {pkg.validity_days} days
                </span>
                <strong>{formatFrom(pkg.calculated_price, "USD")}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
