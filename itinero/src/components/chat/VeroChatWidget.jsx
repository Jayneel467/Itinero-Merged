import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Maximize2, ArrowUp, Mic, Plus, MessageSquare, Trash2 } from 'lucide-react';
import useVeroVoice from '@/features/vero/hooks/useVeroVoice';
import { veroService } from '@/features/vero/services/veroService';
import VeroCardsDeck from '@/features/vero/components/VeroCardsDeck';
import VeroPlaceCards from '@/features/vero/components/VeroPlaceCards';
import VeroVisaSources from '@/features/vero/components/VeroVisaSources';
import VeroTypingStatus from '@/features/vero/components/VeroTypingStatus';
import VeroVoiceStage from '@/features/vero/components/VeroVoiceStage';
import SuggestionChips from '@/features/vero/components/SuggestionChips';
import { useVeroUiOptional } from '@/context/VeroUiContext';
import { useLanguageOptional } from '@/context/LanguageContext';
import { useBillingOptional } from '@/features/billing/BillingContext';
import VeroCreditMeter from '@/features/billing/VeroCreditMeter';
import {
  welcomeFromPageContext,
  extractItineroActions,
  stripItineroActions,
  starterChipsFromPageContext,
} from '@/features/vero/utils/pageContext';
import { suggestFollowUps } from '@/features/vero/utils/suggestFollowUps';
import {
  pageFilterActionFromMessage,
  pageNavActionFromMessage,
  hotelsSearchPath,
  flightsSearchPath,
  packagesSearchPath,
  trainsSearchPath,
  busesSearchPath,
  trackTrainPath,
  trackFlightPath,
  trackAirportPath,
  openTripsPath,
  pnrPath,
  trainFoodPath,
  navActionFromVeroCards,
  isBookingAffirmative,
  extractDepartDateFromText,
  isDateOnlyMessage,
  isHotelDeclined,
  isFlightDeclined,
  isTrainPreferred,
  isBusPreferred,
} from '@/features/vero/utils/pageFilterIntent';
import { detectSpokenLang, isNonEnglishLang } from '@/features/vero/utils/spokenLanguage';
import { persistPreferredName, travelerAddressPayload } from '@/features/vero/utils/travelerAddress';
import { persistSelectedFlight } from '@/features/flights/utils/persistSelectedFlight';
import {
  getThread,
  upsertThread,
  listThreads,
  newThreadId,
  setActiveId,
  hasUserTurn,
  deleteThread,
  fromWidgetMessages,
  toWidgetMessages,
} from '@/features/vero/utils/chatStore';
import {
  answerFromLeftPage,
  instantLiveGuard,
  skipAllInstant,
  isLeftPageListQuestion,
  replyFromNavAction,
  ackCurrentFlightSearch,
} from '@/features/vero/utils/pageAwareAnswer';
import VeroMessageBubble from '@/features/vero/components/VeroMessageBubble';
import './VeroChatWidget.css';
import '@/features/vero/components/VeroCardsDeck.css';

const VERO_AVATAR = `${import.meta.env.BASE_URL}vero-chatbot.png`;

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Floating "Ask For Vero" button + right-side chat drawer.
 * Talks to general_agent (:8001) - user only ever sees Vero.
 * When Flights/Hotels publish page context, welcome + API calls
 * stay aligned with what the user sees on the left.
 */
export default function VeroChatWidget({ isOpen, onClose, onOpen }) {
  const navigate = useNavigate();
  const veroUi = useVeroUiOptional();
  const langCtx = useLanguageOptional();
  const billing = useBillingOptional();
  const applyCreditsRef = useRef(billing?.applyCredits);
  applyCreditsRef.current = billing?.applyCredits;
  const preferredSpoken = langCtx?.spokenLanguage || 'en-IN';
  const pageContext = veroUi?.pageContext || null;

  const welcome = useMemo(() => welcomeFromPageContext(pageContext), [pageContext]);

  // Fresh welcome on load - old threads stay in History, not auto-resumed.
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingFor, setTypingFor] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedThreads, setSavedThreads] = useState(() => listThreads());
  const [threadId, setThreadId] = useState(() => newThreadId());
  const [messages, setMessages] = useState(() => [
    {
      id: 1,
      sender: 'bot',
      text: welcomeFromPageContext(null).botText,
      time: nowTime(),
    },
  ]);
  const messagesEndRef = useRef(null);
  const userHasChattedRef = useRef(false);
  const pageContextRef = useRef(pageContext);
  const lastFlightRef = useRef(null);
  const declinedHotelRef = useRef(false);
  const declinedFlightRef = useRef(false);
  const messagesRef = useRef(messages);
  pageContextRef.current = pageContext;
  messagesRef.current = messages;

  useEffect(() => {
    if (!hasUserTurn(messages)) return;
    upsertThread({
      id: threadId,
      messages: fromWidgetMessages(messages),
      sessionId: threadId,
    });
    setSavedThreads(listThreads());
  }, [messages, threadId]);

  // Refresh the welcome bubble when left-page context changes (before first user msg).
  useEffect(() => {
    if (userHasChattedRef.current) return;
    const next = welcomeFromPageContext(pageContext);
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.sender !== 'bot') return prev;
      if (prev[0].text === next.botText) return prev;
      return [{ ...prev[0], text: next.botText, time: nowTime() }];
    });
  }, [pageContext]);

  // When the drawer opens on a contextual page, re-seed welcome if this thread is still empty.
  useEffect(() => {
    if (!isOpen || userHasChattedRef.current) return;
    const next = welcomeFromPageContext(pageContextRef.current);
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.sender !== 'bot') return prev;
      if (prev[0].text === next.botText) return prev;
      return [{ ...prev[0], text: next.botText, time: nowTime() }];
    });
  }, [isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const handleSendMessage = useCallback(
    async (text, options = {}) => {
      const msgText = (typeof text === 'string' ? text : inputValue).trim();
      // Seeded prompts (Explore / Help CTAs) must not die if a prior turn is still typing.
      if (!msgText || (isTyping && !options.bypassTyping)) return "";

      userHasChattedRef.current = true;

      const lastBot = [...messagesRef.current].reverse().find((m) => m.sender === 'bot');
      const flightItems =
        lastBot?.cards?.type === 'flights' && Array.isArray(lastBot.cards.items)
          ? lastBot.cards.items
          : null;
      let apiText = msgText;
      if (isHotelDeclined(msgText)) declinedHotelRef.current = true;
      if (isFlightDeclined(msgText) || isTrainPreferred(msgText) || isBusPreferred(msgText)) declinedFlightRef.current = true;
      const onFlightsPage = pageContextRef.current?.screen === 'flights';
      if (
        flightItems?.length &&
        isBookingAffirmative(msgText) &&
        !declinedFlightRef.current &&
        !onFlightsPage
      ) {
        const pick = flightItems[0];
        lastFlightRef.current = {
          origin: pick.origin,
          destination: pick.dest,
          depart_date: extractDepartDateFromText(lastBot.cards?.subtitle || '') || lastFlightRef.current?.depart_date,
          flight_id: pick.flight_id,
        };
        apiText =
          `I'll take option 1 - ${pick.airline || ''} ${pick.flight_code || ''} (flight_id=${pick.flight_id}). ` +
          `Proceed to BOOK this flight only (scope=flights_only). Do not add a hotel unless I ask.`;
      } else if (isHotelDeclined(msgText)) {
        apiText = `${msgText}\n\n[User declined hotels. scope=flights_only. Do not offer or book a hotel.]`;
      } else if (isBusPreferred(msgText)) {
        apiText =
          `${msgText}\n\n[User wants BUS, not flights. transport_mode=bus. ` +
          `Call search_buses. Do NOT search_flights or search_trains. Do not show flight cards.]`;
      } else if (isTrainPreferred(msgText) || (declinedFlightRef.current && isFlightDeclined(msgText))) {
        apiText =
          `${msgText}\n\n[User wants TRAIN/bus, not flights. transport_mode=train. ` +
          `Call lookup_india_route. Do NOT search_flights. Do not show flight cards. ` +
          `Ambaji = train to Abu Road (ABR) + taxi. Surat origin if already known.]`;
      } else if (isFlightDeclined(msgText)) {
        apiText = `${msgText}\n\n[User declined flights. Do not search_flights.]`;
      } else if (declinedFlightRef.current) {
        apiText =
          `${msgText}\n\n[Still TRAIN only - user already refused flights. transport_mode=train. ` +
          `Keep origin/destination/date from confirmed_state. Do not re-ask ક્યાં જવું છે.]`;
      } else if (declinedHotelRef.current && isBookingAffirmative(msgText)) {
        apiText = `${msgText}\n\n[Still flights only - user already refused hotels. scope=flights_only.]`;
      } else if (isDateOnlyMessage(msgText) && lastFlightRef.current?.origin) {
        lastFlightRef.current = {
          ...lastFlightRef.current,
          depart_date: extractDepartDateFromText(msgText) || lastFlightRef.current.depart_date,
        };
      }

      const newUserMsg = {
        id: Date.now(),
        sender: 'user',
        text: msgText,
        time: nowTime(),
      };
      setMessages((prev) => [...prev, newUserMsg]);
      setInputValue('');
      setTypingFor(msgText);
      setIsTyping(true);

      const appliedMessages = [];
      const pageCtx = pageContextRef.current;
      const liveGuard = instantLiveGuard(msgText);
      const grounded = liveGuard
        ? { reply: liveGuard }
        : skipAllInstant(msgText)
          ? null
          : answerFromLeftPage(msgText, pageCtx);
      let knownRoute = lastFlightRef.current;
      try {
        if (!knownRoute?.origin) {
          knownRoute = JSON.parse(sessionStorage.getItem("itinero_vero_last_flight_route") || "null");
        }
      } catch {
        knownRoute = lastFlightRef.current;
      }
      let localNav = pageNavActionFromMessage(msgText, pageCtx, knownRoute);
      if (!localNav && pageCtx?.screen !== "booking_success" && pageCtx?.screen !== "flight_confirmation" && lastFlightRef.current?.origin && lastFlightRef.current?.destination) {
        if (isDateOnlyMessage(msgText)) {
          localNav = {
            type: 'search_flights',
            origin: lastFlightRef.current.origin,
            destination: lastFlightRef.current.destination,
            depart_date: lastFlightRef.current.depart_date,
            trip: 'oneway',
            adults: 1,
            cabin: 'Economy',
          };
        }
      }
      const navReply = localNav ? replyFromNavAction(localNav, pageCtx) : null;
      const ackSame = !localNav && !grounded?.reply ? ackCurrentFlightSearch(msgText, pageCtx) : null;
      const localFilter = localNav
        ? null
        : grounded?.action || pageFilterActionFromMessage(msgText, pageCtx);

      const applyAction = async (action) => {
        if (!action?.type) return null;
        if (action.type === "search_hotels" && action.city) {
          navigate(hotelsSearchPath(action));
          return `Hotels in ${action.city} on the left`;
        }
        if (action.type === "search_flights" && action.origin && action.destination) {
          const path = flightsSearchPath(action);
          if (!/from=[A-Z]{3}/.test(path) || !/to=[A-Z]{3}/.test(path)) return null;
          navigate(path);
          const dateBit = action.depart_date ? ` · ${action.depart_date}` : "";
          return `Flights ${action.origin} → ${action.destination}${dateBit} on the left`;
        }
        if (action.type === "search_packages") {
          navigate(packagesSearchPath(action));
          return "Packages on the left";
        }
        if (action.type === "search_trains" && (action.origin || action.from_code) && (action.destination || action.to_code)) {
          navigate(trainsSearchPath(action));
          const win = action.window ? ` · ${action.window}` : "";
          return `Trains ${action.origin || action.from_code} → ${action.destination || action.to_code}${win} on the left`;
        }
        if (action.type === "search_buses" && (action.origin || action.from) && (action.destination || action.to)) {
          navigate(busesSearchPath(action));
          const win = action.window ? ` · ${action.window}` : "";
          return `Transits ${action.origin || action.from} → ${action.destination || action.to}${win} on the left`;
        }
        if (action.type === "track_train" && action.number) {
          navigate(trackTrainPath(action));
          return `Tracking train ${action.number} on the left`;
        }
        if (action.type === "track_airport" && action.airport) {
          navigate(trackAirportPath(action));
          return `Airport board ${String(action.airport).toUpperCase()} on the left`;
        }
        if (action.type === "track_flight" && action.flight) {
          navigate(trackFlightPath(action));
          return `Tracking ${action.flight} on the left`;
        }
        if (action.type === "check_pnr" && action.pnr) {
          navigate(pnrPath(action));
          return `PNR ${action.pnr} on the left`;
        }
        if (action.type === "order_train_food") {
          navigate(trainFoodPath(action));
          return "Food on train on the left";
        }
        if (action.type === "open_trips" || action.type === "open_cancel") {
          navigate(openTripsPath(action));
          return "My Trips on the left - tap Cancel booking if you want to cancel";
        }
        if (action.type === "open_profile") {
          navigate("/profile");
          return "Account on the left";
        }
        if (action.type === "open_plus") {
          navigate("/plus");
          return "Vero credits on the left";
        }
        if (action.type === "open_flights") {
          navigate("/flights");
          return "Flights on the left";
        }
        if (action.type === "open_hotels") {
          navigate("/hotels");
          return "Hotels on the left";
        }
        if (action.type === "open_packages") {
          navigate("/packages");
          return "Packages on the left";
        }
        if (action.type === "open_trains") {
          navigate("/trains");
          return "Trains on the left";
        }
        if (action.type === "open_buses") {
          navigate("/transits");
          return "Transits on the left";
        }
        if (action.type === "open_passenger_details" || action.type === "proceed_booking") {
          if (veroUi?.applyUiAction) {
            try {
              const r = await veroUi.applyUiAction(action);
              if (r?.ok) return r.message || "Passenger details on the left";
            } catch {
              /* home / other pages have no flights handler */
            }
          }
          let selected = null;
          try {
            selected = JSON.parse(sessionStorage.getItem("itinero_selected_flight") || "null");
          } catch {
            selected = null;
          }
          if (selected?.offerId || selected?.id || selected?.airline || selected?.flightNumber) {
            navigate("/flights/passenger-info");
            return "Passenger details on the left";
          }
          const route = lastFlightRef.current || (() => {
            try {
              return JSON.parse(sessionStorage.getItem("itinero_vero_last_flight_route") || "null");
            } catch {
              return null;
            }
          })();
          if (route?.origin && route?.destination) {
            const path = flightsSearchPath({
              origin: route.origin,
              destination: route.destination,
              depart_date: route.depart_date,
              trip: "oneway",
              adults: 1,
              cabin: "Economy",
            });
            navigate(path);
            return `Flights ${route.origin} → ${route.destination} on the left - pick a fare, then continue`;
          }
          navigate("/flights");
          return "Flights on the left - search and pick a fare to continue booking";
        }
        if (
          action.type === "select_airline" ||
          action.type === "select_flight" ||
          action.type === "highlight_offer" ||
          action.type === "open_offer"
        ) {
          if (!veroUi?.applyUiAction) return null;
          const r = await veroUi.applyUiAction(action);
          return r?.ok ? r.message : null;
        }
        if (!veroUi?.applyUiAction) return null;
        const r = await veroUi.applyUiAction(action);
        return r?.ok ? r.message : null;
      };

      if (localNav) {
        try {
          const msg = await applyAction(localNav);
          if (msg) {
            appliedMessages.push(msg);
            setMessages((prev) =>
              prev.map((m) => (m.id === newUserMsg.id ? { ...m, applied: msg } : m))
            );
          }
        } catch {
          /* ignore */
        }
      } else if (localFilter) {
        try {
          const msg = await applyAction(localFilter);
          if (msg) {
            appliedMessages.push(msg);
            setMessages((prev) =>
              prev.map((m) => (m.id === newUserMsg.id ? { ...m, applied: msg } : m))
            );
          }
        } catch {
          /* ignore */
        }
      }

      if (localNav?.type === 'search_flights') {
        lastFlightRef.current = {
          origin: localNav.origin,
          destination: localNav.destination,
          depart_date: localNav.depart_date || lastFlightRef.current?.depart_date,
          flight_id: lastFlightRef.current?.flight_id,
        };
        try {
          sessionStorage.setItem(
            "itinero_vero_last_flight_route",
            JSON.stringify(lastFlightRef.current)
          );
        } catch {
          /* ignore */
        }
      }

      const spokenLang =
        options.spokenLanguage ||
        detectSpokenLang(msgText, preferredSpoken) ||
        preferredSpoken;
      const instantReply = navReply || grounded?.reply || ackSame;
      if (instantReply && !options.voiceMode && !isNonEnglishLang(spokenLang)) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: instantReply,
            time: nowTime(),
          },
        ]);
        setIsTyping(false);
        veroService
          .chat({
            message: apiText,
            thread_id: threadId,
            page_context: pageContextRef.current || undefined,
            voice_mode: Boolean(options.voiceMode),
            spoken_language: spokenLang,
            traveler: travelerAddressPayload(),
          })
          .then((res) => {
            if (res.thread_id) setThreadId(res.thread_id);
            if (typeof res.preferred_name === "string") persistPreferredName(res.preferred_name);
          })
          .catch(() => {});
        return instantReply;
      }

      try {
        const res = await veroService.chat({
          message: apiText,
          thread_id: threadId,
          page_context: pageContextRef.current || undefined,
          voice_mode: Boolean(options.voiceMode),
          spoken_language: spokenLang,
          traveler: travelerAddressPayload(),
        });
        if (res.credits) applyCreditsRef.current?.(res.credits);
        if (res.thread_id) setThreadId(res.thread_id);
        if (typeof res.preferred_name === "string") persistPreferredName(res.preferred_name);
        const rawReply = res.reply || "Sorry - I couldn't reply just now.";
        const actions = extractItineroActions(rawReply);
        const displayText = stripItineroActions(rawReply) || rawReply;
        if (actions.length) {
          for (const action of actions) {
            const dupNav =
              localNav &&
              action?.type === localNav.type &&
              String(action.city || "") === String(localNav.city || "") &&
              String(action.origin || "") === String(localNav.origin || "");
            const dupFilter =
              localFilter &&
              action?.type === localFilter.type &&
              String(action.query || "") === String(localFilter.query || "");
            if (dupNav || dupFilter) continue;
            // eslint-disable-next-line no-await-in-loop
            const msg = await applyAction(action);
            if (msg) appliedMessages.push(msg);
          }
        }
        const cardNav = navActionFromVeroCards(res.cards);
        if (cardNav) {
          const already =
            appliedMessages.length > 0 &&
            ((cardNav.type === "search_flights" && localNav?.type === "search_flights") ||
              (cardNav.type === "search_hotels" && localNav?.type === "search_hotels") ||
              (cardNav.type === "search_trains" && localNav?.type === "search_trains") ||
              (cardNav.type === "search_buses" && localNav?.type === "search_buses") ||
              actions.some(
                (a) =>
                  a?.type === cardNav.type &&
                  String(a.origin || a.city || "") === String(cardNav.origin || cardNav.city || "")
              ));
          if (!already) {
            const msg = await applyAction(cardNav);
            if (msg) appliedMessages.push(msg);
          }
        }
        if (res.cards?.type === "flights" && res.cards.items?.[0]) {
          const pick = res.cards.items[0];
          persistSelectedFlight({
            id: pick.flight_id || pick.offer_id || pick.flight_code,
            offer_id: pick.offer_id || pick.flight_id,
            price: pick.price,
            currency: pick.currency || "INR",
            currencyCode: pick.currency || "INR",
            airline: {
              name: pick.airline,
              code: pick.airline_code,
              logo: pick.logo || pick.airline_logo,
            },
            flightNumber: pick.flight_code || pick.flight_number,
            origin: pick.origin,
            dest: pick.dest,
            dep_time: pick.dep_time,
            arr_time: pick.arr_time,
            duration: pick.duration,
            stops: pick.stops,
            fare_family: pick.fare_family || pick.cabin || null,
            cabin: pick.cabin || pick.fare_family || null,
          });
          const msg = await applyAction({
            type: "select_airline",
            airline: pick.airline,
            flight_number: pick.flight_code || pick.flight_number,
            offer_id: pick.flight_id || pick.offer_id,
          });
          if (msg) appliedMessages.push(msg);
        }
        if (appliedMessages.length) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newUserMsg.id
                ? { ...m, applied: appliedMessages.join(" · ") }
                : m
            )
          );
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: displayText,
            time: nowTime(),
            cards: res.cards || null,
            places: res.places || (['places', 'events'].includes(res.cards?.type) ? res.cards.items : null),
            suggestions: res.suggestions || null,
          },
        ]);
        if (res.cards?.type === 'flights' && res.cards.items?.[0]) {
          const pick = res.cards.items[0];
          lastFlightRef.current = {
            origin: pick.origin,
            destination: pick.dest,
            depart_date:
              extractDepartDateFromText(res.cards.subtitle || '') || lastFlightRef.current?.depart_date,
            flight_id: pick.flight_id,
          };
          try {
            sessionStorage.setItem(
              "itinero_vero_last_flight_route",
              JSON.stringify(lastFlightRef.current)
            );
          } catch {
            /* ignore */
          }
        }
        return displayText;
      } catch (err) {
        const raw = String(err?.message || "");
        const friendly =
          /__end__|^END$/i.test(raw) ||
          /is not defined/i.test(raw) ||
          err?.name === "ReferenceError"
            ? "I hit a snag - say that again and I'll continue."
            : raw || "Vero is taking a break - check that the API is running on port 8001.";
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: friendly,
            time: nowTime(),
          },
        ]);
        return friendly;
      } finally {
        setIsTyping(false);
      }
    },
    [inputValue, isTyping, threadId, veroUi, navigate, preferredSpoken]
  );

  const onVoiceTranscript = useCallback(
    (text, meta) => handleSendMessage(text, meta),
    [handleSendMessage]
  );
  const voice = useVeroVoice({ onTranscript: onVoiceTranscript });

  const handleNewChat = useCallback(() => {
    if (hasUserTurn(messages)) {
      upsertThread({
        id: threadId,
        messages: fromWidgetMessages(messages),
        sessionId: threadId,
      });
    }
    const id = newThreadId();
    setThreadId(id);
    setActiveId(id);
    userHasChattedRef.current = false;
    setIsTyping(false);
    setTypingFor('');
    setInputValue('');
    setHistoryOpen(false);
    setMessages([
      {
        id: 1,
        sender: 'bot',
        text: welcomeFromPageContext(pageContextRef.current).botText,
        time: nowTime(),
      },
    ]);
    setSavedThreads(listThreads());
    try {
      voice.stopVoice?.();
    } catch {
      /* ignore */
    }
  }, [messages, threadId, voice]);

  const handleSendMessageRef = useRef(handleSendMessage);
  const handleNewChatRef = useRef(handleNewChat);
  const veroUiRef = useRef(veroUi);
  handleSendMessageRef.current = handleSendMessage;
  handleNewChatRef.current = handleNewChat;
  veroUiRef.current = veroUi;

  const loadSavedThread = useCallback((id) => {
    const thread = getThread(id);
    if (!thread) return;
    const msgs = toWidgetMessages(thread.messages);
    setThreadId(thread.id);
    setActiveId(thread.id);
    setMessages(
      msgs.length
        ? msgs
        : [
            {
              id: 1,
              sender: 'bot',
              text: welcomeFromPageContext(null).botText,
              time: nowTime(),
            },
          ]
    );
    userHasChattedRef.current = hasUserTurn(msgs);
    setHistoryOpen(false);
    setIsTyping(false);
    setTypingFor('');
  }, []);

  const deleteSavedThread = useCallback(
    (id) => {
      if (!id) return;
      const wasActive = threadId === id;
      deleteThread(id);
      setSavedThreads(listThreads());
      if (!wasActive) return;
      handleNewChatRef.current?.();
    },
    [threadId]
  );

  // Seed prompts (Help / Explore / trip CTAs) - fire even if drawer already open.
  // Consume inside the timeout so React Strict Mode remounts don't eat the prompt
  // before send. Do not depend on the whole `veroUi` object (clearing pending would
  // re-run this effect and cancel the scheduled send).
  useEffect(() => {
    if (!isOpen || !veroUi?.pendingNonce || !veroUiRef.current?.pendingPrompt) return undefined;
    const nonce = veroUi.pendingNonce;
    const t = setTimeout(() => {
      const ui = veroUiRef.current;
      if (!ui?.pendingPrompt || ui.pendingNonce !== nonce) return;
      const payload = ui.consumePendingPrompt?.();
      const text = typeof payload === "string" ? payload : payload?.prompt;
      if (!text) return;
      const forceNew = Boolean(
        payload?.forceNew || payload?.source === "help" || payload?.source === "explore"
      );
      if (forceNew || !hasUserTurn(messagesRef.current)) {
        handleNewChatRef.current();
      }
      // Let new-chat state settle, then send.
      setTimeout(() => {
        handleSendMessageRef.current(text, { bypassTyping: true });
      }, forceNew ? 40 : 0);
    }, 120);
    return () => clearTimeout(t);
  }, [isOpen, veroUi?.pendingNonce]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  const avatarFallback = (e) => {
    e.target.src = 'https://ui-avatars.com/api/?name=Vero+AI&background=F97211&color=fff';
  };

  const showWelcomeHero = messages.length <= 1;
  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.sender === 'user') || null,
    [messages]
  );
  const lastBot = useMemo(
    () => [...messages].reverse().find((m) => m.sender === 'bot') || null,
    [messages]
  );
  const chips = useMemo(() => {
    if (isTyping) return [];
    if (showWelcomeHero) return starterChipsFromPageContext(pageContext) || [];
    return suggestFollowUps({
      userText: lastUser?.text,
      replyText: lastBot?.text,
      apiSuggestions: lastBot?.suggestions,
      pageContext,
      hasCards: Boolean(lastBot?.cards?.items?.length),
    });
  }, [isTyping, showWelcomeHero, pageContext, lastUser, lastBot]);

  const openFullPage = useCallback(() => {
    if (hasUserTurn(messages)) {
      upsertThread({
        id: threadId,
        messages: fromWidgetMessages(messages),
        sessionId: threadId,
      });
    }
    setActiveId(threadId);
    setSavedThreads(listThreads());
    onClose?.();
    navigate('/vero');
  }, [messages, threadId, navigate, onClose]);

  const placeholder =
    pageContext?.screen === 'flights'
      ? 'Ask about these flights…'
      : pageContext?.screen === 'hotels'
        ? 'Ask about these hotels…'
        : pageContext?.screen === 'package_detail'
          ? 'Ask me to customize this package…'
          : 'Tell Vero the trip…';

  return (
    <>
      <div className={`vero-floating-widget ${isOpen ? 'hidden' : ''}`}>
        <button type="button" className="vero-floating-btn" onClick={onOpen} aria-label="Ask For Vero">
          <img
            src={VERO_AVATAR}
            alt="Vero AI"
            className="vero-floating-avatar"
            onError={avatarFallback}
          />
        </button>
      </div>

      <div className={`vero-drawer ${isOpen ? 'open' : ''}${voice.voiceMode ? ' is-voice' : ''}`} aria-hidden={!isOpen}>
        <div className="vero-drawer-header">
          <div className="vero-header-profile">
            <div className="vero-header-avatar-wrap">
              <img
                src={VERO_AVATAR}
                alt="Vero AI"
                className="vero-header-avatar"
                onError={avatarFallback}
              />
              <div className="vero-status-dot" />
            </div>
            <div className="vero-header-info">
              <h3 className="vero-header-title">
                Vero <span className="vero-badge">Agent</span>
              </h3>
              <p className="vero-header-subtitle">
                {pageContext?.screen === 'flights' && pageContext?.search
                  ? `${pageContext.search.origin} → ${pageContext.search.destination}`
                  : pageContext?.screen === 'hotels' && pageContext?.search
                    ? `Hotels · ${pageContext.search.city}`
                    : pageContext?.screen === 'package_detail' && pageContext?.package?.title
                      ? `Package · ${pageContext.package.title}`
                      : pageContext?.screen === 'trips' && pageContext?.detail?.title
                        ? `Trip · ${pageContext.detail.title}`
                        : pageContext?.screen === 'notifications'
                          ? welcome?.subtitle || 'Alerts'
                          : pageContext?.screen === 'profile'
                            ? welcome?.subtitle || 'Account'
                            : pageContext?.screen === 'saved'
                              ? welcome?.subtitle || 'Saved'
                              : pageContext?.screen === 'help'
                                ? welcome?.subtitle || 'Help'
                                : welcome?.subtitle || 'Your travel agent'}
              </p>
            </div>
          </div>
          <VeroCreditMeter compact />
          <div className="vero-header-actions">
            <button
              type="button"
              className="vero-icon-btn"
              onClick={handleNewChat}
              title="New chat"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className={`vero-icon-btn${historyOpen ? ' is-active' : ''}`}
              onClick={() => setHistoryOpen((open) => !open)}
              title="Saved chats"
              aria-label="Saved chats"
              aria-expanded={historyOpen}
            >
              <MessageSquare size={16} />
            </button>
            <button
              type="button"
              className="vero-icon-btn"
              onClick={openFullPage}
              title="Open full Vero page"
            >
              <Maximize2 size={16} />
            </button>
            <button type="button" className="vero-icon-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        {voice.voiceMode ? (
          <div className="vero-drawer-voice">
            <VeroVoiceStage
              compact
              showLeftHint={Boolean(
                lastBot?.cards?.items?.length ||
                  lastBot?.places?.length ||
                  lastBot?.cards?.type === "trains" ||
                  lastBot?.cards?.type === "buses"
              )}
              phase={voice.phase}
              level={voice.level}
              hint={voice.hint}
              heard={voice.heardText}
              liveCaption={voice.liveCaption}
              reply={voice.replyText}
              spokenLang={voice.spokenLang}
              cards={
                lastBot?.cards &&
                !['places', 'events', 'visa_sources', 'trains', 'buses'].includes(lastBot.cards.type)
                  ? lastBot.cards
                  : null
              }
              places={
                lastBot?.places ||
                (['places', 'events'].includes(lastBot?.cards?.type) ? lastBot.cards.items : null)
              }
              onToggle={voice.toggleVoice}
              onEnd={voice.stopVoice}
              onSelectCard={(text) => voice.injectUtterance?.(text)}
            />
          </div>
        ) : (
          <>
        {historyOpen ? (
          <div className="vero-history-panel" role="listbox" aria-label="Saved chats">
            {savedThreads.length === 0 ? (
              <p className="vero-history-empty">No saved chats yet</p>
            ) : (
              savedThreads.map((thread) => (
                <div key={thread.id} className="vero-history-row">
                  <button
                    type="button"
                    className={`vero-history-item${thread.id === threadId ? ' is-active' : ''}`}
                    onClick={() => loadSavedThread(thread.id)}
                    title={thread.title || 'Chat'}
                  >
                    <span>{thread.title || 'Chat'}</span>
                  </button>
                  <button
                    type="button"
                    className="vero-history-delete"
                    aria-label={`Delete chat: ${thread.title || 'Chat'}`}
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedThread(thread.id);
                    }}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
        <div className="vero-drawer-body">
          {showWelcomeHero && (
            <div className="vero-welcome-section">
              <img
                src={VERO_AVATAR}
                alt="Vero AI"
                className="vero-large-avatar"
                onError={avatarFallback}
              />
              <h1 className="vero-welcome-title">{welcome.title}</h1>
              <p className="vero-welcome-subtitle">{welcome.subtitle}</p>
              <p className="vero-welcome-desc">{welcome.desc}</p>
            </div>
          )}

          <div className="vero-chat-messages">
            {messages.map((msg) => (
              <VeroMessageBubble
                key={msg.id}
                sender={msg.sender}
                text={msg.text}
                time={msg.time}
                applied={msg.applied}
                hasCards={Boolean(
                  (msg.cards?.items?.length && !['trains', 'buses'].includes(msg.cards?.type)) || msg.places?.length
                )}
              >
                {msg.sender === 'bot' && msg.cards?.items?.length > 0 && !['places', 'events', 'visa_sources', 'trains', 'buses'].includes(msg.cards.type) && (
                  <VeroCardsDeck cards={msg.cards} onSelect={handleSendMessage} />
                )}
                {msg.sender === 'bot' && msg.cards?.type === 'visa_sources' ? (
                  <VeroVisaSources cards={msg.cards} />
                ) : null}
                {msg.sender === 'bot' && (msg.places?.length || msg.cards?.type === 'places' || msg.cards?.type === 'events') ? (
                  <VeroPlaceCards places={msg.places || msg.cards.items} />
                ) : null}
              </VeroMessageBubble>
            ))}
            {isTyping && (
              <VeroMessageBubble
                sender="bot"
                typing
                typingNode={<VeroTypingStatus active userMessage={typingFor} />}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="vero-drawer-footer">
          {!isTyping && chips.length > 0 && (
            <SuggestionChips
              suggestions={chips}
              onSelect={handleSendMessage}
              disabled={isTyping}
            />
          )}
          <div className="vero-input-container">
            <input
              type="text"
              className="vero-text-input"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isTyping}
            />
            <button
              type="button"
              className="vero-mic-btn"
              onClick={voice.toggleVoice}
              aria-label="Talk to Vero"
            >
              <Mic size={18} />
            </button>
            <button
              type="button"
              className="vero-send-btn"
              onClick={() => handleSendMessage()}
              disabled={isTyping || !inputValue.trim()}
              aria-label="Send"
            >
              <ArrowUp size={18} color="#fff" />
            </button>
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
}
