import React, { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import styles from '../HotelDetailPage.module.css';

const MOCK_REVIEWS = [
  {
    id: 1,
    name: 'Sarah Johnson',
    date: '2 days ago',
    rating: 5,
    text: 'Amazing stay! perfect location with stunning Burj Khalifa View. The Service was exceptional and the rooms were faultless. We especially loved the breakfast buffet which had a massive variety of fresh foods. The concierge was also incredibly helpful in booking our desert safari and dinner reservations.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  },
  {
    id: 2,
    name: 'Michael Brown',
    date: '3 days ago',
    rating: 4,
    text: 'Everything was perfect from check-in to check-out. Highly recommend this hotel for anyone visiting Dubai. The only minor issue was the pool area got a bit crowded during the afternoon.',
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  },
  {
    id: 3,
    name: 'Emma Wilson',
    date: '1 week ago',
    rating: 5,
    text: 'Truly a 5-star experience. The room was spacious, spotless, and had a magical view. Room service was fast and the food was delicious.',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  },
  {
    id: 4,
    name: 'James Rodriguez',
    date: '2 weeks ago',
    rating: 3,
    text: 'The location is great, but the check-in process took way too long. The staff were polite but clearly overwhelmed. Room was clean.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  },
  {
    id: 5,
    name: 'Linda Chen',
    date: '1 month ago',
    rating: 5,
    text: 'Beautiful property and amazing hospitality. We celebrated our anniversary here and they surprised us with a cake in the room!',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  },
  {
    id: 6,
    name: 'Robert Fox',
    date: '1 month ago',
    rating: 4,
    text: 'Solid hotel, great location next to the mall. Gym could use an upgrade, but the pool is fantastic.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
  }
];

const ReviewCard = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.text.length > 150;

  return (
    <div className="bg-white p-5 rounded-[12px] border border-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.03)] mb-4 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <img src={review.avatar} alt={review.name} className="w-10 h-10 rounded-full object-cover" />
          <div>
            <h4 className="font-bold text-[#001439]">{review.name}</h4>
            <span className="text-sm text-gray-500">{review.date}</span>
          </div>
        </div>
        <div className="flex text-[#F97211]">
          {Array(review.rating).fill(0).map((_, i) => (
            <span key={i} className="text-sm">★</span>
          ))}
        </div>
      </div>
      <p className="text-gray-700 text-sm leading-relaxed">
        {expanded ? review.text : (isLong ? `${review.text.substring(0, 150)}...` : review.text)}
      </p>
      {isLong && (
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="text-[#F97211] font-bold text-sm mt-2 hover:underline"
        >
          {expanded ? 'Read Less' : 'Read More'}
        </button>
      )}
    </div>
  );
};

export default function HotelReviews() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState('newest'); // newest, highest, lowest
  const [filterRating, setFilterRating] = useState('all'); // all, 5, 4, 3, 2, 1
  const [visibleCount, setVisibleCount] = useState(4);

  // Filter and Sort Logic
  const processedReviews = useMemo(() => {
    let result = [...MOCK_REVIEWS];
    
    // Filter
    if (filterRating !== 'all') {
      result = result.filter(r => r.rating === Number(filterRating));
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'highest') return b.rating - a.rating;
      if (sortBy === 'lowest') return a.rating - b.rating;
      return b.id - a.id; // Mocking newest with ID
    });

    return result;
  }, [sortBy, filterRating]);

  return (
    <>
      <div className={styles.HotelReviews_container}>
        <div className={styles.HotelReviews_titleRow}>
          <h2 className={styles.HotelReviews_sectionTitle}>Guest Reviews</h2>
          <button className={styles.HotelReviews_viewAllBtn} onClick={() => setIsModalOpen(true)}>
            View All Reviews
          </button>
        </div>

        <div className={styles.HotelReviews_reviewsGrid}>
          {/* Left Side: Rating Breakdown */}
          <div className={styles.HotelReviews_ratingBreakdown}>
            <div className={styles.HotelReviews_overallRating}>
              <div className={styles.HotelReviews_ratingScore}>4.8</div>
              <div className={styles.HotelReviews_ratingInfo}>
                <div className={styles.HotelReviews_ratingText}>Excellent</div>
                <div className={styles.HotelReviews_stars}>
                  {Array(5).fill(0).map((_, i) => (
                    <span key={i} className={styles.star}>★</span>
                  ))}
                </div>
                <div className={styles.HotelReviews_reviewsCount}>2,456 reviews</div>
              </div>
            </div>

            <div className={styles.HotelReviews_barsContainer}>
              <div className={styles.HotelReviews_barRow}>
                <span className={styles.HotelReviews_barLabel}>5 Excellent</span>
                <div className={styles.HotelReviews_barTrack}><div className={styles.HotelReviews_barFill} style={{width: '75%'}}></div></div>
                <span className={styles.HotelReviews_barPercent}>75%</span>
              </div>
              <div className={styles.HotelReviews_barRow}>
                <span className={styles.HotelReviews_barLabel}>4 Very Good</span>
                <div className={styles.HotelReviews_barTrack}><div className={styles.HotelReviews_barFill} style={{width: '20%'}}></div></div>
                <span className={styles.HotelReviews_barPercent}>20%</span>
              </div>
              <div className={styles.HotelReviews_barRow}>
                <span className={styles.HotelReviews_barLabel}>3 Average</span>
                <div className={styles.HotelReviews_barTrack}><div className={styles.HotelReviews_barFill} style={{width: '6%'}}></div></div>
                <span className={styles.HotelReviews_barPercent}>6%</span>
              </div>
            </div>
          </div>

          {/* Right Side: Preview Review Comments */}
          <div className={styles.HotelReviews_reviewsList}>
            {MOCK_REVIEWS.slice(0, 2).map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </div>
      </div>

      {/* Full Reviews Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="All Guest Reviews">
        <div className="flex flex-col h-full bg-gray-50/50">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-4 p-6 bg-white border-b border-gray-100">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Filter by Rating</label>
              <div className="relative">
                <select 
                  className="w-full appearance-none bg-gray-50 border border-gray-200 text-[#001439] py-3 pl-4 pr-10 rounded-lg outline-none focus:ring-2 focus:ring-[#F97211]/30 transition-all font-medium"
                  value={filterRating}
                  onChange={(e) => { setFilterRating(e.target.value); setVisibleCount(4); }}
                >
                  <option value="all">All Ratings</option>
                  <option value="5">5 Stars (Excellent)</option>
                  <option value="4">4 Stars (Very Good)</option>
                  <option value="3">3 Stars (Average)</option>
                  <option value="2">2 Stars (Poor)</option>
                  <option value="1">1 Star (Terrible)</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sort By</label>
              <div className="relative">
                <select 
                  className="w-full appearance-none bg-gray-50 border border-gray-200 text-[#001439] py-3 pl-4 pr-10 rounded-lg outline-none focus:ring-2 focus:ring-[#F97211]/30 transition-all font-medium"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setVisibleCount(4); }}
                >
                  <option value="newest">Newest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Reviews List */}
          <div className="p-6">
            {processedReviews.length === 0 ? (
              <div className="text-center py-10 text-gray-500 font-medium">No reviews found matching your filters.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {processedReviews.slice(0, visibleCount).map(review => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}

            {/* Pagination / Load More */}
            {visibleCount < processedReviews.length && (
              <div className="mt-8 text-center pb-4">
                <button 
                  onClick={() => setVisibleCount(prev => prev + 4)}
                  className="px-8 py-3 rounded-full bg-white border-2 border-[#001439] text-[#001439] font-bold hover:bg-[#001439] hover:text-white transition-colors shadow-sm"
                >
                  Load More Reviews
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
