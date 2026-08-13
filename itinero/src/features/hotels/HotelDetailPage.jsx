import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import PageLayout from "@/components/layout/PageLayout";
import styles from "./HotelDetailPage.module.css";
import HotelDetailHero from "./components/HotelDetailHero";
import HotelAbout from "./components/HotelAbout";
import HotelAmenitiesGrid from "./components/HotelAmenitiesGrid";
import HotelRoomList from "./components/HotelRoomList";
import HotelReviews from "./components/HotelReviews";
import HotelBookingCard from "./components/HotelBookingCard";
import HotelPriceIncludes from "./components/HotelPriceIncludes";
import HotelLocationMap from "./components/HotelLocationMap";
import HotelHelpCard from "./components/HotelHelpCard";
import { hotelService } from "./services/hotelService";
import { useCurrency } from "@/context/CurrencyContext";
import { LoadingState } from "@/components/shared";

function toYmd(v, fallbackDays = 0) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(Date.now() + fallbackDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Hotel detail - full LiteAPI property + live room rates (no mock inventory).
 */
export default function HotelDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { currency } = useCurrency();
  const seeded = location.state?.hotel || null;

  const [hotel, setHotel] = useState(seeded);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      const res = await hotelService.getRates(id, {
        check_in: toYmd(searchParams.get("checkIn"), 0),
        check_out: toYmd(searchParams.get("checkOut"), 1),
        guests: Number(searchParams.get("guests") || 2),
        rooms: Number(searchParams.get("rooms") || 1),
        currency,
      });
      if (cancelled) return;
      if (res.hotel) {
        setHotel((prev) => ({
          ...prev,
          ...res.hotel,
          images:
            Array.isArray(res.hotel.images) && res.hotel.images.length
              ? res.hotel.images
              : prev?.images || (res.hotel.image ? [res.hotel.image] : []),
        }));
      }
      setRooms(Array.isArray(res.rooms) ? res.rooms : []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, currency, searchParams]);

  const facilities = hotel?.facilities || hotel?.amenities || [];

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        <div className={styles.mainLayout}>
          <div className={styles.heroSection}>
            {loading && !hotel && (
              <LoadingState
                title="Loading property"
                message="Fetching live details and photos…"
                skeleton="hotel"
                count={1}
              />
            )}
            <HotelDetailHero hotel={hotel} />
          </div>

          <div className={styles.contentGrid}>
            <div className={styles.mainColumn}>
              <section className={styles.section}>
                <HotelAbout
                  description={hotel?.description}
                  importantInformation={hotel?.importantInformation}
                  checkinCheckout={hotel?.checkinCheckout}
                />
              </section>
              <section className={styles.section}>
                <HotelAmenitiesGrid facilities={facilities} />
              </section>
              <section className={styles.section}>
                <HotelRoomList rooms={rooms} hotelId={id} loading={loading} />
              </section>
              <section className={styles.section}>
                <HotelReviews
                  hotelId={id}
                  rating={hotel?.rating}
                  ratingText={hotel?.ratingText}
                  reviewCount={hotel?.reviewCount}
                />
              </section>
            </div>

            <div className={styles.sidebarColumn}>
              <div className={styles.stickySidebar}>
                <HotelBookingCard hotel={hotel} />
                <HotelPriceIncludes />
                <HotelLocationMap
                  latitude={hotel?.latitude}
                  longitude={hotel?.longitude}
                  address={hotel?.address || hotel?.location}
                  name={hotel?.name}
                />
                <HotelHelpCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
