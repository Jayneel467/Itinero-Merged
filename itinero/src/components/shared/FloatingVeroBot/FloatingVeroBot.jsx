import React from "react";
import { Link } from "react-router-dom";
import { AI_BUDDY_IMAGES } from "@/constants/images";
import "./FloatingVeroBot.css";

/**
 * Sticky "Ask For Vero" bot — opens the Vero chat page.
 */
export default function FloatingVeroBot() {
  return (
    <Link to="/vero" className="vero-bot" aria-label="Ask For Vero">
      <div className="vero-bot__chat-bubble">
        <span>Ask For Vero</span>
      </div>
      <img
        src={AI_BUDDY_IMAGES.chatAvatar}
        className="vero-bot__avatar"
        alt="Vero AI Avatar"
      />
    </Link>
  );
}
