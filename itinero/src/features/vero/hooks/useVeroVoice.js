import { useCallback, useEffect, useRef, useState } from "react";
import { veroService } from "../services/veroService";
import {
  detectSpokenLang,
  normalizeSpokenLang,
  sarvamCanSpeak,
  speakableText,
  voiceGreeting,
  voiceHint,
} from "../utils/spokenLanguage";
import { useLanguageOptional } from "@/context/LanguageContext";

function browserListen(lang) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return Promise.reject(new Error("Voice not supported in this browser."));
  }
  return new Promise((resolve, reject) => {
    const rec = new SpeechRecognition();
    rec.lang = lang || navigator.language || "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || "";
      resolve(text.trim());
    };
    rec.onerror = (event) => {
      if (event?.error === "no-speech" || event?.error === "aborted") {
        resolve("");
        return;
      }
      // Chrome often returns the useless code "network" when cloud SR is blocked.
      reject(new Error(event?.error === "network" ? "browser-sr-network" : event?.error || "Listen failed"));
    };
    rec.onend = () => {};
    try {
      rec.start();
    } catch (err) {
      reject(err);
    }
  });
}

function browserSpeak(text, lang) {
  if (!window.speechSynthesis || !text) return Promise.resolve();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || "en-IN";
    const voices = window.speechSynthesis.getVoices?.() || [];
    const match =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(String(lang || "").toLowerCase().slice(0, 2))) ||
      voices.find((v) => String(v.lang || "").toLowerCase().startsWith("hi")) ||
      voices.find((v) => String(v.lang || "").toLowerCase().startsWith("en"));
    if (match) utter.voice = match;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

function friendlyVoiceError(err) {
  const raw = String(err?.message || err?.name || "").toLowerCase();
  if (
    raw === "network" ||
    raw === "browser-sr-network" ||
    raw.includes("failed to fetch") ||
    raw.includes("networkerror") ||
    raw.includes("load failed") ||
    raw.includes("stt unavailable") ||
    raw.includes("tts unavailable") ||
    raw.includes("not found") ||
    raw.includes("invalid file type")
  ) {
    return "Can't reach Vero voice - reconnecting…";
  }
  if (raw.includes("notallowed") || raw.includes("permission") || raw.includes("denied")) {
    return "Allow the mic, then tap the orb";
  }
  if (raw.includes("not configured") || raw.includes("sarvam api key")) {
    return "Voice isn’t configured on the server";
  }
  if (/^(stt|tts) \d+$/i.test(raw.trim())) {
    return "Voice hiccup - speak again";
  }
  if (/^[a-z][a-z-]+$/.test(String(err?.message || "")) && String(err?.message || "").length < 28) {
    return "Could not hear that - try again";
  }
  return String(err?.message || "Could not hear that");
}

function startLiveCaption(lang, onText) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return () => {};
  const rec = new SpeechRecognition();
  rec.lang = lang || navigator.language || "en-IN";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    let interim = "";
    let finalTxt = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i]?.[0]?.transcript || "";
      if (event.results[i].isFinal) finalTxt += piece;
      else interim += piece;
    }
    const next = `${finalTxt} ${interim}`.trim();
    if (next) onText(next);
  };
  rec.onerror = () => {};
  try {
    rec.start();
  } catch {
    return () => {};
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    try {
      rec.abort();
    } catch {
      /* ignore */
    }
  };
}

function rmsFromAnalyser(analyser, buffer) {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Record until the user finishes speaking (silence), ChatGPT-style.
 * Tap-to-stop is only for hanging up the whole call, not ending a sentence.
 */
function recordUntilSilence(stream, { onLevel, maxMs = 22000, silenceMs = 900, minSpeechMs = 280 } = {}) {
  const mime = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks = [];
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);

  return new Promise((resolve, reject) => {
    let startedSpeech = false;
    let lastLoud = Date.now();
    const startedAt = Date.now();
    let tick = null;

    const cleanup = () => {
      if (tick) window.clearInterval(tick);
      tick = null;
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      audioCtx.close().catch(() => {});
      recordUntilSilence._stop = null;
    };

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Mic recording failed"));
    };
    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    const stopRec = () => {
      if (recorder.state !== "recording") return;
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      recorder.stop();
    };

    recordUntilSilence._stop = stopRec;
    recorder.start(200);

    tick = window.setInterval(() => {
      const level = rmsFromAnalyser(analyser, samples);
      onLevel?.(level);
      const now = Date.now();
      const elapsed = now - startedAt;
      if (level >= 0.02) {
        startedSpeech = true;
        lastLoud = now;
      }
      if (elapsed >= maxMs) {
        stopRec();
        return;
      }
      if (!startedSpeech && elapsed >= 9000) {
        stopRec();
        return;
      }
      if (startedSpeech && now - lastLoud >= silenceMs && now - startedAt >= minSpeechMs + 250) {
        stopRec();
      }
    }, 70);
  });
}

/**
 * ChatGPT-style voice call: tap once to start, speak naturally, Vero answers
 * out loud, then listens again. Tap mic to hang up (or to interrupt while she talks).
 */
export default function useVeroVoice({ onTranscript } = {}) {
  const langCtx = useLanguageOptional();
  const preferredSpoken = langCtx?.spokenLanguage || "en-IN";
  const [voiceMode, setVoiceMode] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [spokenLang, setSpokenLang] = useState(preferredSpoken);
  const [hint, setHint] = useState("");
  const [level, setLevel] = useState(0);
  const [sarvam, setSarvam] = useState({ stt: false, tts: false });
  const [heardText, setHeardText] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const [replyText, setReplyText] = useState("");
  const sarvamRef = useRef({ stt: false, tts: false });
  const voiceModeRef = useRef(false);
  const langRef = useRef("");
  const phaseRef = useRef("idle");
  const onTranscriptRef = useRef(onTranscript);
  const loopRef = useRef(0);
  const streamRef = useRef(null);
  const liveStopRef = useRef(null);
  const liveCaptionRef = useRef("");
  const listenOnceRef = useRef(null);

  onTranscriptRef.current = onTranscript;
  voiceModeRef.current = voiceMode;
  langRef.current = spokenLang;
  phaseRef.current = phase;
  sarvamRef.current = sarvam;

  const refreshCaps = useCallback(async () => {
    try {
      const s = await veroService.voiceStatus();
      const next = { stt: Boolean(s?.stt), tts: Boolean(s?.tts) };
      sarvamRef.current = next;
      setSarvam(next);
      return next;
    } catch {
      const next = { stt: false, tts: false };
      sarvamRef.current = next;
      setSarvam(next);
      return next;
    }
  }, []);

  useEffect(() => {
    if (!preferredSpoken) return;
    setSpokenLang(preferredSpoken);
    langRef.current = preferredSpoken;
  }, [preferredSpoken]);

  useEffect(() => {
    let alive = true;
    refreshCaps().then((s) => {
      if (!alive) return;
      setSarvam(s);
    });
    return () => {
      alive = false;
    };
  }, [refreshCaps]);

  const stopLiveCaption = useCallback(() => {
    try {
      liveStopRef.current?.();
    } catch {
      /* ignore */
    }
    liveStopRef.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    stopLiveCaption();
    try {
      recordUntilSilence._stop?.();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopLiveCaption]);

  const stopVoice = useCallback(() => {
    loopRef.current += 1;
    voiceModeRef.current = false;
    setVoiceMode(false);
    setPhase("idle");
    phaseRef.current = "idle";
    setHint("");
    setLevel(0);
    setLiveCaption("");
    veroService.stopSpeaking?.();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    releaseMic();
  }, [releaseMic]);

  const ensureMic = useCallback(async () => {
    if (streamRef.current?.active) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    return stream;
  }, []);

  const runTurn = useCallback(async (token, text, lang) => {
    if (!voiceModeRef.current || token !== loopRef.current) return;
    const spokenIn = String(text || "").trim();
    if (!spokenIn) {
      window.setTimeout(() => listenOnce(token), 200);
      return;
    }
    setHeardText(spokenIn);
    setLiveCaption("");
    setSpokenLang(lang);
    langRef.current = lang;
    setPhase("thinking");
    phaseRef.current = "thinking";
    setHint(voiceHint("thinking", lang));
    setReplyText("");

    let reply = "";
    try {
      reply = await onTranscriptRef.current?.(spokenIn, { voiceMode: true, spokenLanguage: lang });
    } catch {
      reply = "";
    }
    if (!voiceModeRef.current || token !== loopRef.current) return;

    const spoken = speakableText(reply || "");
    if (spoken) {
      setReplyText(spoken);
      setPhase("speaking");
      phaseRef.current = "speaking";
      setHint(voiceHint("speaking", lang));
      try {
        if (sarvamRef.current.tts && sarvamCanSpeak(lang)) {
          await veroService.speakText(spoken, lang);
        } else {
          await browserSpeak(spoken, lang);
        }
      } catch {
        await browserSpeak(spoken, lang);
      }
    }

    if (voiceModeRef.current && token === loopRef.current) {
      listenOnceRef.current?.(token);
    }
  }, []);

  const listenOnce = useCallback(async (token) => {
    if (!voiceModeRef.current || token !== loopRef.current) return;
    setPhase("listening");
    phaseRef.current = "listening";
    setHint(voiceHint("listening", langRef.current));
    setLevel(0);
    setLiveCaption("");
    setReplyText("");

    let text = "";
    let lang = langRef.current;
    const caps = sarvamRef.current;
    try {
      if (caps.stt) {
        const stream = await ensureMic();
        if (!voiceModeRef.current || token !== loopRef.current) return;
        stopLiveCaption();
        liveCaptionRef.current = "";
        liveStopRef.current = startLiveCaption(langRef.current || "en-IN", (caption) => {
          if (token !== loopRef.current) return;
          liveCaptionRef.current = caption;
          setLiveCaption(caption);
        });
        const blob = await recordUntilSilence(stream, {
          onLevel: (value) => {
            if (token === loopRef.current) setLevel(value);
          },
        });
        stopLiveCaption();
        if (!voiceModeRef.current || token !== loopRef.current) return;
        if (!blob || blob.size < 800) {
          window.setTimeout(() => listenOnce(token), 200);
          return;
        }
        const result = await veroService.transcribeAudio(blob);
        text = String(result?.text || "").trim() || String(liveCaptionRef.current || "").trim();
        lang = normalizeSpokenLang(
          result?.language_code || detectSpokenLang(text, langRef.current || "en-IN"),
          langRef.current || "en-IN"
        );
      } else {
        const revived = await refreshCaps();
        if (revived.stt && voiceModeRef.current && token === loopRef.current) {
          window.setTimeout(() => listenOnce(token), 50);
          return;
        }
        setHint("Can't reach Vero voice - reconnecting…");
        window.setTimeout(() => listenOnce(token), 1200);
        return;
      }
    } catch (err) {
      stopLiveCaption();
      if (!voiceModeRef.current || token !== loopRef.current) return;
      setHint(friendlyVoiceError(err));
      await refreshCaps();
      if (voiceModeRef.current && token === loopRef.current) {
        window.setTimeout(() => listenOnce(token), 900);
      }
      return;
    }

    if (!voiceModeRef.current || token !== loopRef.current) return;
    setLevel(0);
    await runTurn(token, text, lang);
  }, [ensureMic, refreshCaps, runTurn, stopLiveCaption]);

  listenOnceRef.current = listenOnce;

  const startVoice = useCallback(() => {
    loopRef.current += 1;
    const token = loopRef.current;
    voiceModeRef.current = true;
    setVoiceMode(true);
    setPhase("listening");
    phaseRef.current = "listening";
    setHint(voiceHint("listening", langRef.current));

    (async () => {
      veroService.unlockAudio?.();
      await refreshCaps();
      if (!voiceModeRef.current || token !== loopRef.current) return;
      veroService.unlockAudio?.();
      const greet = voiceGreeting(langRef.current);
      setReplyText(greet);
      setPhase("speaking");
      phaseRef.current = "speaking";
      setHint(voiceHint("speaking", langRef.current));
      try {
        await veroService.speakText(greet, langRef.current || "en-IN");
      } catch {
        await browserSpeak(greet, langRef.current || "en-IN");
      }
      if (!voiceModeRef.current || token !== loopRef.current) return;
      listenOnce(token);
    })();
  }, [listenOnce, refreshCaps]);

  const toggleVoice = useCallback(() => {
    if (!voiceModeRef.current) {
      veroService.unlockAudio?.();
      startVoice();
      return;
    }
    // ChatGPT: tap while she is talking → interrupt and listen again.
    if (phaseRef.current === "speaking") {
      veroService.stopSpeaking?.();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    stopVoice();
  }, [startVoice, stopVoice]);

  const injectUtterance = useCallback(
    (text) => {
      const spoken = String(text || "").trim();
      if (!spoken || !voiceModeRef.current) return;
      stopLiveCaption();
      veroService.stopSpeaking?.();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      loopRef.current += 1;
      const token = loopRef.current;
      runTurn(token, spoken, langRef.current || detectSpokenLang(spoken, "en-IN"));
    },
    [runTurn, stopLiveCaption]
  );

  useEffect(
    () => () => {
      loopRef.current += 1;
      voiceModeRef.current = false;
      veroService.stopSpeaking?.();
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      try {
        recordUntilSilence._stop?.();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    []
  );

  return {
    voiceMode,
    phase,
    spokenLang,
    hint,
    level,
    heardText,
    liveCaption,
    replyText,
    sarvamReady: Boolean(sarvam.stt || sarvam.tts),
    startVoice,
    stopVoice,
    toggleVoice,
    injectUtterance,
  };
}
