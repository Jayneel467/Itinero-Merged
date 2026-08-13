"""Vero Killer Set — ~50 constraint-satisfaction prompts.

These are deliberately nastier than the 300. A model can ace “Plan Bali for
seven days” and still fail here. Success = eliminate infeasible options,
respect EVERY hard constraint, search live facts, never invent.

K01 / K02 are the flagship examples from the benchmark spec.
"""

from __future__ import annotations

from .metrics import infer_metrics

# (id, source_ids, bucket, prompt, hard_constraints)
_RAW: list[tuple[str, list[int], str, str, list[str]]] = [
    (
        "K01", [145, 146, 147, 197, 199], "D",
        "We're two Indian citizens currently in Mumbai. We have ₹1.8 lakh total for a "
        "7-night international honeymoon leaving anytime between September 3–6. Neither "
        "of us drinks, we're pure vegetarian and don't eat eggs, neither of us drives, "
        "one passenger is 18, we want a luxury-feeling hotel for at least three nights, "
        "adventure on two days, plenty of private couple time, and no more than one hotel "
        "change. Check weather seasonality, visa requirements, flight prices, hotel "
        "check-in age policies, local transportation, activity age requirements and "
        "realistic total costs. Compare Thailand, Bali, Vietnam and Mauritius, eliminate "
        "any option that violates a hard constraint, pick exactly one winner and build "
        "the complete bookable itinerary.",
        ["in_passport", "budget_inr_180000_total", "7_nights", "depart_sep_3_6",
         "no_alcohol", "pure_veg_no_egg", "no_drive", "one_pax_18", "luxury_3n+",
         "adventure_2d", "max_1_hotel_change", "compare_4_dests", "eliminate_then_pick_1"],
    ),
    (
        "K02", [221, 233, 235, 246, 247, 248], "E",
        "We're an 18- and 19-year-old couple in Pennsylvania with $2,500 total and no car. "
        "We want a seven-night romantic trip somewhere in the US, departing next Thursday. "
        "We want one major theme park or adventure day, two upscale date nights, at least "
        "one scenic experience, hotels we can legally check into ourselves, and no travel "
        "segment longer than six hours unless overnight. Compare Boston, Virginia, Orlando, "
        "Chicago and Maine using current transport and accommodation costs, eliminate "
        "infeasible options, then build the best trip without exceeding the budget.",
        ["ages_18_19", "budget_usd_2500_total", "7_nights", "depart_next_thu", "no_car",
         "themepark_or_adventure_1d", "2_upscale_date_nights", "1_scenic",
         "hotel_checkin_age_ok", "max_hop_6h_unless_overnight", "compare_5_dests"],
    ),
    (
        "K03", [4, 11, 41], "A",
        "I'm landing BOM at 07:10, hotel in Andheri check-in 14:00, one 24kg suitcase I "
        "cannot leave at the airport. I want Gateway, Colaba, Bandra, Juhu, Siddhivinayak "
        "and BKC today under ₹2,500 excluding hotel, no car, vegetarian no-egg meals. "
        "Tell me which stops to drop, order the rest geographically, and give realistic "
        "local-train/metro times. Do not invent fares.",
        ["land_0710_bom", "andheri_checkin_1400", "luggage_until_hotel",
         "drop_impossible_stops", "budget_2500", "no_car", "pure_veg"],
    ),
    (
        "K04", [21, 24, 27], "A",
        "It's 44°C in Jaipur. Plan today for my 72-year-old parents: one uses a wheelchair, "
        "both vegetarian no-egg, budget ₹3,000 including autos, no forts with many stairs, "
        "must be back at the hotel 12–16:00 for rest. Indoor/shaded only 11:00–16:00.",
        ["44c", "elderly", "wheelchair", "pure_veg", "budget_3000", "no_stair_forts",
         "hotel_rest_12_16", "shade_midday"],
    ),
    (
        "K05", [20, 19, 37], "A",
        "Varanasi: I want sunrise boat + evening Ganga Aarti with reserved/less-waiting "
        "access if it exists, vegetarian no-egg, ₹2,000, arriving on the 23:40 train "
        "tonight with a 06:10 departure tomorrow. If that is impossible, say so and "
        "give the least-bad 8-hour window.",
        ["sunrise_boat", "aarti", "pure_veg", "budget_2000", "arrive_2340", "leave_0610",
         "admit_impossible"],
    ),
    (
        "K06", [28, 43, 44], "A",
        "Delhi day: wheelchair user + me, ₹3,500 total transport+food, no Uber, metro "
        "only if truly step-free with working lifts. Order India Gate, Red Fort, Qutub, "
        "Lotus Temple, CP by accessibility not Instagram. Drop any stop that fails.",
        ["wheelchair", "budget_3500", "no_uber", "step_free_metro_only", "drop_inaccessible"],
    ),
    (
        "K07", [39, 40, 30], "A",
        "Mumbai: 5:30 AM IndiGo tomorrow from T2, I'm in Colaba with luggage until 20:00 "
        "left-luggage closes. Plan tonight sober, vegetarian no-egg, in bed by 22:00, "
        "airport buffer that won't miss the flight if local trains are slow.",
        ["flight_0530_t2", "luggage_until_2000", "sober", "pure_veg", "sleep_2200",
         "miss_flight_risk"],
    ),
    (
        "K08", [34, 35, 38], "A",
        "I'm 18, alone in Bangalore after 23:00, don't drink, vegetarian no-egg, ₹1,200, "
        "want somewhere lively but actually safe for a solo woman. No 'just take an Uber "
        "to a pub'. If nothing is safe, say stay in.",
        ["age_18", "solo_woman_2300", "sober", "pure_veg", "budget_1200", "safety_over_vibe"],
    ),
    (
        "K09", [52, 66, 70], "B",
        "Mumbai→Goa Friday night, back Monday 09:00 office in Andheri, two large suitcases, "
        "₹18,000 for two including stay+transport, one of us gets motion sickness on ghat "
        "buses. Compare train vs bus vs flight with live-ish times, pick one, and say "
        "which suitcase plan fails.",
        ["bom_goa_fri_mon", "office_0900_andheri", "2_large_bags", "budget_18000_two",
         "motion_sickness", "compare_3_modes"],
    ),
    (
        "K10", [58, 59, 72], "B",
        "Golden Triangle 5 days from Delhi, no car, don't change hotels every night "
        "(max 2 hotels total), vegetarian no-egg, ₹22,000 for two excl. trains. Must "
        "not feel rushed. If Agra+Jaipur in 5 days with 2 hotels is stupid, fix the "
        "destination set.",
        ["golden_triangle", "no_car", "max_2_hotels", "pure_veg", "budget_22000_two",
         "not_rushed", "may_drop_city"],
    ),
    (
        "K11", [67, 68, 69], "B",
        "Delhi→Mumbai tomorrow: compare Rajdhani vs Vande Bharat vs cheapest flight vs "
        "overnight bus. I have 2 suitcases, want safest good-value, arrive before 11:00 "
        "for a 14:00 meeting in BKC. Don't invent seat availability; search or hedge.",
        ["del_bom_tomorrow", "arrive_before_1100", "2_bags", "meeting_bkc_1400",
         "no_invent_availability"],
    ),
    (
        "K12", [74, 84, 95], "B",
        "Himachal 6 days from Delhi, I get severe motion sickness, no dangerous hill "
        "roads, ₹40,000 for two, vegetarian no-egg. A landslide just closed the Manali "
        "highway. Rebuild: keep mountains, drop Manali if needed, no overnight bus hairpins.",
        ["himachal_6d", "motion_sickness", "no_dangerous_roads", "budget_40000_two",
         "pure_veg", "landslide_manali_closed"],
    ),
    (
        "K13", [91, 92, 93], "B",
        "IRCTC waitlist 18 on tonight's Mumbai–Pune, RAC on the return Sunday. I have not "
        "paid a hotel yet. Should I book the WL? Build a confirmed backup (bus/flight) "
        "under ₹4,000 extra and a Day-1 plan if the inbound arrives 6 hours late.",
        ["wl_18", "rac_return", "no_hotel_yet", "backup_under_4000", "late_6h_day1"],
    ),
    (
        "K14", [94, 96, 99], "B",
        "Rajasthan week: Jaipur flight cancelled, Goa monsoon dump for 3 days was the "
        "backup beach idea. Cut ₹10,000 without removing a destination. Starting Surat, "
        "no car, vegetarian no-egg, 2 pax. Salvage with trains only if they actually exist.",
        ["jaipur_flight_cancel", "goa_rain_3d", "cut_10000", "keep_destinations",
         "from_surat", "no_car", "pure_veg"],
    ),
    (
        "K15", [81, 82, 88], "B",
        "₹50,000 for two, 7 days, Indian couple, September, vegetarian no-egg, no alcohol, "
        "one of us is 18. Pick exactly one India honeymoon that isn't an overcrowded "
        "tourist default. Show the budget split. If ₹50k is too tight for 'honeymoon', "
        "say so.",
        ["budget_50000_two", "7d", "sep", "pure_veg", "sober", "age_18", "not_overcrowded",
         "budget_split"],
    ),
    (
        "K16", [102, 103, 105], "C",
        "I want Mumbai, Goa, Jaipur and Kashmir in 12 days, ₹75,000 total including "
        "flights for 2, no travel day over 6 hours, starting tomorrow from Surat. Tell "
        "me if the route is stupid, give the cheapest logical order, and drop cities "
        "until travel-time and budget both work.",
        ["4_cities_incoherent", "12d", "budget_75000_two", "max_hop_6h", "leave_tomorrow",
         "from_surat", "drop_until_feasible"],
    ),
    (
        "K17", [106, 107, 108], "C",
        "Trip with parents (60s, vegetarian no-egg, hate walking) + girlfriend (wants "
        "nightlife, eats meat, hates temples) + me (adventure). 6 days, ₹80,000 total "
        "from Delhi, no flights. Every restaurant must work for mixed diet. If no single "
        "city works, split days explicitly.",
        ["3_way_conflict", "parents_veg_low_walk", "gf_nightlife_meat", "me_adventure",
         "6d", "budget_80000", "no_flights", "mixed_diet_restaurants"],
    ),
    (
        "K18", [110, 111], "C",
        "Family of 12 including 3 senior citizens, 1 wheelchair, 2 toddlers. Rajasthan "
        "7 nights, from Delhi, no car (need a tempo/tempo traveller or trains only), "
        "₹3.5 lakh total. No fort that fails wheelchair+stroller. Show rooming plan and "
        "hidden costs (tolls, extra beds, entry tickets ×12).",
        ["party_12", "3_seniors", "1_wheelchair", "2_toddlers", "rajasthan_7n",
         "no_car", "budget_350000", "rooming", "hidden_costs_x12"],
    ),
    (
        "K19", [112, 113, 114], "C",
        "Goa 4 nights: I don't drink, party, or eat seafood; vegetarian no-egg; ₹20,000 "
        "solo from Pune; overnight transport to save a hotel night. No beach-shack default. "
        "If Goa is a bad fit, replace the destination.",
        ["goa_anti_party", "pure_veg_no_seafood", "budget_20000_solo", "from_pune",
         "overnight_save_hotel", "may_replace_goa"],
    ),
    (
        "K20", [118, 119, 120], "C",
        "10-day India trip entirely around Indian Railways, flights only if they save ≥4 "
        "hours AND still cheaper after station transfers. Start Mumbai, ₹35,000 solo, "
        "vegetarian no-egg, no waitlist-only legs. Stress-test every connection for RAC/WL.",
        ["rail_first", "flight_only_if_save_4h", "from_bom", "budget_35000_solo",
         "pure_veg", "no_wl_only", "stress_connections"],
    ),
    (
        "K21", [122, 123, 126], "C",
        "I don't know where I want to go. ₹25,000, 4 days, starting Mumbai tomorrow "
        "morning, vegetarian no-egg, no car, I hate beaches. Ask at most 3 questions "
        "then DECIDE. Give 3 options and which one YOU would book, with a budget split.",
        ["underspecified", "budget_25000", "4d", "leave_tomorrow_bom", "pure_veg",
         "no_car", "no_beach", "max_3_questions_then_decide"],
    ),
    (
        "K22", [125, 200, 142], "C",
        "One week, ₹80,000 for two from Mumbai, Indian passports, one pax 18, pure veg "
        "no-egg, no alcohol. Should we stay in India or go international? Compare 1 "
        "India option vs 1 international with visa reality, flight+stay+food, and pick "
        "the better value. Do not guess visas.",
        ["1_week", "budget_80000_two", "from_bom", "in_passports", "age_18", "pure_veg",
         "sober", "india_vs_intl", "no_visa_guess"],
    ),
    (
        "K23", [132, 134, 137, 140], "C",
        "Here is my draft: Day1 Mumbai, Day2 fly Goa, Day3 fly Jaipur, Day4 fly Srinagar, "
        "Day5 fly back Mumbai. ₹40,000 for two. Show exactly where the budget goes, "
        "hidden costs I forgot, what would make it fail, and stress-test before I book. "
        "Then rewrite a feasible version.",
        ["insane_draft_itinerary", "budget_40000_two", "line_item_budget", "hidden_costs",
         "failure_modes", "rewrite_feasible"],
    ),
    (
        "K24", [151, 154, 155, 156], "D",
        "Indian passports, valid US F-1, itinerary: BOM→LHR (self-transfer, 1h20, change "
        "terminals)→FRA→JFK on two separate tickets, then EWR→SCE. Tell me EVERY visa/"
        "transit/entry requirement, whether LHR 1h20 is enough, whether F-1 helps Schengen "
        "or UK airside, and a safer routing that minimizes transit-visa problems. Never guess.",
        ["in_passport", "f1", "self_transfer_lhr_80min", "terminal_change", "separate_tickets",
         "fra_transit", "jfk_then_ewr_sce", "no_visa_guess", "safer_routing"],
    ),
    (
        "K25", [159, 160, 158], "D",
        "BOM→DOH→JFK, 55-minute Doha connection, then 1h20 JFK–EWR self-transfer with "
        "3 checked bags. Should I book it? If no, give the least-stressful one-ticket "
        "alternative even if ₹8–12k more. Assume Indian passport, US F-1.",
        ["doh_55min", "jfk_ewr_self_transfer", "3_checked", "in_passport_f1",
         "prefer_stress_over_cheap"],
    ),
    (
        "K26", [164, 165, 166, 167, 169], "D",
        "India→State College, PA, no car, 2 large suitcases + 1 cabin, land ~22:00. "
        "Compare JFK vs EWR vs PHL vs IAD for reaching SCE, including last buses/Amtrak. "
        "If landing 22:00 means stay-near-airport, say so. Least stressful, not cheapest. "
        "University check-in is tomorrow 10:00.",
        ["india_to_sce", "no_car", "2_large_1_cabin", "land_2200", "compare_4_gateways",
         "uni_checkin_1000", "least_stress"],
    ),
    (
        "K27", [175, 177, 178], "D",
        "Indian couple, NYC + LA + Miami in 9 days, no rental car, vegetarian no-egg, "
        "₹2.2 lakh excl. transpacific/transatlantic flights already bought into JFK. "
        "Fix the plan: drop a city if needed, Amtrak/public only, realistic jet-lag day 1.",
        ["nyc_la_miami_9d_insane", "no_car", "pure_veg", "budget_220000_excl_longhaul",
         "may_drop_city", "amtrak_public"],
    ),
    (
        "K28", [181, 186, 187, 188], "D",
        "Europe 9 days, Indian couple, ₹2 lakh excl. flights, pure vegetarian no-egg, "
        "never wake before 08:00, max one hotel change, apply Schengen through the "
        "correct country for THIS itinerary. Compare Paris+Amsterdam+Switzerland vs "
        "Italy-only vs no-Paris romantic. Pick one. Do not guess visa rules.",
        ["europe_9d", "budget_200000_excl_flights", "pure_veg", "wake_after_8",
         "max_1_hotel_change", "schengen_main_destination_rule", "compare_3", "no_visa_guess"],
    ),
    (
        "K29", [191, 192, 199], "D",
        "International honeymoon under ₹1.5 lakh TOTAL from BOM, Indian passports, one "
        "pax 18, pure veg no-egg, no alcohol, no driving. Compare Japan vs South Korea "
        "vs Thailand. Eliminate any that fail visa timing or 18+ hotel check-in, pick one "
        "winner with a bookable sketch.",
        ["budget_150000_total", "from_bom", "age_18", "pure_veg", "sober", "no_drive",
         "compare_jp_kr_th", "visa_timing", "hotel_age"],
    ),
    (
        "K30", [218, 219, 231], "E",
        "7-day California, $1,500 ground budget for two, no rental car, one traveler 18. "
        "Is LA realistic without a car? If not, redesign around SF + rail/buses only. "
        "Hotel check-in must allow an 18-year-old primary guest. Search, don't assume.",
        ["ca_7d", "ground_1500_two", "no_car", "age_18", "la_feasibility",
         "hotel_18_primary", "search_age_policy"],
    ),
    (
        "K31", [220, 232, 247], "E",
        "Under-21 honeymoon, Florida, 6 nights, $2,200 total from PHL, neither drinks, "
        "no car. Theme-park day cannot require a 21+ renter. Hotels must check in 18/19. "
        "If Orlando fails on transport+age+budget, switch to a walkable city.",
        ["under_21", "florida_6n", "budget_2200_from_phl", "sober", "no_car",
         "no_21_rental_for_park", "hotel_18_ok"],
    ),
    (
        "K32", [221, 236, 239], "E",
        "Pennsylvania start, no car: can I do Yellowstone OR New England fall foliage in "
        "7 nights under $2,800? If Yellowstone without a vehicle is infeasible, eliminate "
        "it explicitly. Build the survivor with Amtrak/bus only, max hop 6h unless overnight.",
        ["from_pa", "no_car", "7n", "budget_2800", "yellowstone_vs_new_england",
         "eliminate_infeasible", "max_hop_6h"],
    ),
    (
        "K33", [238, 240, 242], "E",
        "This weekend only, under $200 RT from PHL or EWR, then a 4-day trip under $700 "
        "more. Arizona in summer heat vs somewhere cooler. I hate hiking. Pick one, "
        "adapt for heat, don't invent the $200 fare — search or say unknown.",
        ["weekend", "rt_under_200", "plus_700_4d", "az_summer_vs_cooler", "no_hiking",
         "no_invent_fare"],
    ),
    (
        "K34", [246, 248, 249, 250], "E",
        "I'm 18, partner 19, US domestic week: NYC→Philly→DC on trains, $1,800 total, "
        "want two date nights that aren't bars. Find EVERY hidden age restriction "
        "(hotel primary guest, some tours, museums late nights, Amtrak alcohol) that "
        "could break it. Stress-test before I pay.",
        ["ages_18_19", "nec_corridor", "budget_1800", "sober_date_nights",
         "hidden_age_rules", "stress_test_prepay"],
    ),
    (
        "K35", [260, 269, 273], "F",
        "US passports, Iceland OR New Zealand OR Costa Rica, 8 nights, no rental car, "
        "$4,500 total from JFK, one traveler has mobility limits (no long hikes, limited "
        "stairs). Eliminate any destination that secretly requires a car, then build one "
        "winner. Don't guess weather seasonality — check.",
        ["us_passport", "compare_is_nz_cr", "8n", "no_car", "budget_4500_jfk",
         "mobility_limits", "seasonality_check"],
    ),
    (
        "K36", [281, 282, 283, 284], "F",
        "US passport expires in 5 months. Planned trip: NYC→London→Paris→Rome→NYC in "
        "October, plus a Doha stopover on the return. Tell me entry/ETA/visa for every "
        "country AND whether 5 months validity blocks any of them. Transit documents for "
        "DOH. Never guess; search or unknown.",
        ["us_passport", "expires_5mo", "lhr_cdg_fco", "doh_stopover", "validity_6mo_rule",
         "no_guess"],
    ),
    (
        "K37", [285, 286, 287, 289], "F",
        "Separate-ticket JFK→LIS (55 min)→OPO, then low-cost to BCN, carry-on only. "
        "List everything that can go wrong (bags, visa, IRROPS, no protection). Should I "
        "book the 55-min? Build a least-stress routing that avoids transit visas, even if "
        "more expensive.",
        ["separate_tickets", "lis_55min", "lcc_to_bcn", "carry_on_only", "failure_modes",
         "least_stress_reroute"],
    ),
    (
        "K38", [290, 291, 292], "F",
        "Compare $620 one-stop vs $790 nonstop JFK–FCO for a 10-day Italy trip. We have "
        "4 checked bags on the cheap fare's weight limit unknown. Carry-on-only redesign "
        "vs paying bag fees. Whole-trip cost, not sticker price. Don't invent bag fees.",
        ["620_vs_790", "jfk_fco", "4_checked", "whole_trip_cost", "no_invent_bag_fees"],
    ),
    (
        "K39", [293, 294, 295, 296], "F",
        "US couple, vegetarian no-egg + one wheelchair user. 10-day Japan, every hotel "
        "within 400m of rail, never change hotels for fewer than 3 nights (so max 3 "
        "hotels), no rental car. Pure veg in Japan must be specific, not 'you'll find "
        "something'. Search accessibility uncertainty vs inventing elevators.",
        ["us_couple", "pure_veg_no_egg", "wheelchair", "japan_10d", "hotel_near_rail_400m",
         "min_3n_per_hotel", "no_car", "no_invent_elevators"],
    ),
    (
        "K40", [297, 298, 299, 300], "F",
        "Our JFK–CDG outbound cancelled; we can leave one day later. One destination "
        "(Turkey add-on) just announced a new visa requirement for US passports — assume "
        "we don't have time to get it. Cut the trip budget 25% without shortening nights. "
        "Reroute, then audit every likely failure before we pay.",
        ["outbound_cancel_plus_1d", "new_visa_on_turkey", "cut_budget_25pct", "same_nights",
         "reroute", "prepay_audit"],
    ),
    (
        "K41", [1, 7, 46], "A",
        "₹1,000 in Jaipur vs ₹2,000 in Mumbai vs ₹8,000 Bangalore anniversary evening — "
        "build all three today-plans, then tell me which city gives the best day per rupee "
        "for a couple that doesn't drink and is vegetarian no-egg. No invented attraction "
        "ticket prices; estimate bands or search.",
        ["three_city_value_compare", "sober", "pure_veg", "no_invent_tickets"],
    ),
    (
        "K42", [55, 54, 66], "B",
        "Can I realistically do Mumbai→Pune→Mumbai same day AND Bangalore→Mysore day trip "
        "in the same week, using overnight transport once to save a hotel night, ₹9,000 "
        "total solo, back for a 09:00 Monday meeting in Andheri? If either day is fake, "
        "kill it.",
        ["bom_pnq_same_day", "blr_mysore_daytrip", "overnight_once", "budget_9000_solo",
         "monday_0900_andheri", "kill_fake_days"],
    ),
    (
        "K43", [75, 76], "B",
        "Northeast + Sikkim + Darjeeling in 10 days from Kolkata, inner-line/permit "
        "requirements for an Indian citizen, monsoon week, ₹55,000 for two, no car, "
        "one traveler gets motion sickness. Don't invent permit rules — search or unknown.",
        ["northeast_sikkim_darj_10d", "from_ccu", "ilp_permits", "monsoon",
         "budget_55000_two", "no_car", "motion_sickness", "no_invent_permits"],
    ),
    (
        "K44", [153, 186, 155], "D",
        "Indian passport + F-1, want Schengen 12 days after landing JFK (I'm a student in "
        "PA). Can I apply from the US? Which country for this itinerary: 4n Rome, 3n "
        "Florence, 3n Paris, 2n Amsterdam? Transit FRA without Schengen on the way in? "
        "Never guess.",
        ["in_passport_f1", "apply_from_us", "schengen_12d", "rome_florence_paris_ams",
         "fra_transit_no_schengen", "no_guess"],
    ),
    (
        "K45", [176, 247, 199], "D",
        "US honeymoon for an Indian couple already in NYC (F-1), ₹1.5 lakh leftover, one "
        "pax 18, pure veg no-egg, no car, 8 nights. US domestic vs flying to Europe vs "
        "back to India for the honeymoon — pick one with visa/age reality.",
        ["already_in_nyc_f1", "budget_150000", "age_18", "pure_veg", "no_car", "8n",
         "us_vs_europe_vs_india"],
    ),
    (
        "K46", [207, 208, 220], "E",
        "NYC 3 nights, traveler is 18, doesn't drink, vegetarian no-egg, staying in NJ "
        "(PATH/NJ Transit), $400 ground+food. Sober nightlife that isn't a bar, no Times "
        "Square default, back to NJ by 23:30 each night. Hotel already booked — don't "
        "rebook it.",
        ["nyc_3n", "age_18", "sober", "pure_veg", "stay_nj", "budget_400_ground",
         "home_by_2330", "hotel_already_booked"],
    ),
    (
        "K47", [230, 227, 218], "E",
        "Vegas→LA→SF without driving, 6 nights, $1,200 ground for two, one pax 18. "
        "Flights vs Amtrak/bus, hotel age 18 primary. If Vegas hotels block 18, eliminate "
        "Vegas. Don't invent the FlyAway/Amtrak times.",
        ["vegas_la_sf", "no_drive", "6n", "ground_1200_two", "age_18", "may_drop_vegas",
         "no_invent_times"],
    ),
    (
        "K48", [257, 256, 258], "F",
        "London+Paris+Amsterdam in 7 days from JFK, US passports, $3,200 total including "
        "flights, Eurostar not assumed cheap. Is 7 days three cities a bad idea? If yes, "
        "drop one. Passport expires in 7 months — check validity. Vegetarian no-egg.",
        ["lhr_cdg_ams_7d", "budget_3200_incl_flights", "may_drop_city", "passport_7mo",
         "pure_veg", "no_assume_eurostar_price"],
    ),
    (
        "K49", [278, 272, 271], "F",
        "US couple, Carnival in Brazil vs Mexico City 4 days vs Cancun not all-inclusive, "
        "$2,800 from JFK, one traveler 20 (alcohol/club age), vegetarian no-egg. Eliminate "
        "by visa/entry, age, and budget, pick one. Carnival dates must be real — search.",
        ["carnival_vs_mex_vs_cun", "budget_2800_jfk", "age_20", "pure_veg",
         "no_all_inclusive", "search_carnival_dates"],
    ),
    (
        "K50", [300, 140, 23], "F",
        "Audit this bookable-looking plan before I pay: JFK→LIS 55min self-transfer→OPO "
        "3n, low-cost to BCN 2n, fly to FCO 2n, US passport expiring in 5 months, 4 checked "
        "bags, vegetarian no-egg, $3,400 total, one pax 18. List every likely failure "
        "(visa validity, connection, bags, hotel age, diet, budget) and only then offer a "
        "fixed itinerary. Do not invent a single fare.",
        ["prepay_full_audit", "lis_55_self_transfer", "opo_bcn_fco", "passport_5mo",
         "4_checked", "pure_veg", "budget_3400", "age_18", "no_invent_fare"],
    ),
]

assert len(_RAW) == 50, len(_RAW)
assert [x[0] for x in _RAW] == [f"K{i:02d}" for i in range(1, 51)]


def all_killers() -> list[dict]:
    items = []
    for kid, sources, bucket, prompt, constraints in _RAW:
        items.append({
            "id": kid,
            "source_ids": sources,
            "bucket": bucket,
            "prompt": prompt,
            "hard_constraints": constraints,
            "vague": False,
            "needs_live": True,
            "metrics": infer_metrics(prompt),
            "expected_behaviors": [
                "Treat this as constraint satisfaction, not travel prose.",
                "Eliminate any option that violates a HARD constraint before picking a winner.",
                "Search (or explicitly unknown) for visas, hotel age, live fares, weather/season.",
                "Never invent flight/hotel/visa/availability facts.",
                "If the budget cannot buy the trip, say impossible and offer a cheaper feasible plan.",
                "Distinguish confirmed vs estimated vs unknown.",
                "Do not take unauthorized booking actions.",
                "End with one concrete next booking step (or a refusal to book without confirmation).",
            ],
        })
    return items


BY_ID = {k["id"]: k for k in all_killers()}
