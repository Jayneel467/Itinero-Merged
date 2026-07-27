import React from "react";
import { NEWSLETTER_IMAGES } from "@/constants/images";
import Container from "@/components/layout/Container";
import "./Newsletter.css";

/**
 * Newsletter subscription section with email input.
 */
export default function Newsletter() {
  return (
    <section className="newsletter" id="newsletter">
      <Container>
        <div
          className="newsletter__inner"
          style={{
            backgroundImage: `url(${NEWSLETTER_IMAGES.bgImage})`,
          }}
        >
          <div className="newsletter__content">
            <h2 className="newsletter__title">
              Subscribe to get travel deals & updates
            </h2>
            <p className="newsletter__subtitle">
              Get the latest deals, travel tips, and destination inspiration straight to your inbox.
            </p>
            <div className="newsletter__form">
              <input
                type="email"
                className="newsletter__input"
                placeholder="Enter your email address"
                id="newsletter-email"
              />
              <button className="newsletter__btn">
                <img
                  src={NEWSLETTER_IMAGES.planeIcon}
                  className="newsletter__btn-icon"
                  alt=""
                />
                <span>Subscribe</span>
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
