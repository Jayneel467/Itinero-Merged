import React from "react";
import { PARTNER_IMAGES } from "@/constants/images";
import Container from "@/components/layout/Container";
import "./TrustedBy.css";

/**
 * "Trusted by Millions" partner logos strip.
 */
const PARTNERS = Object.values(PARTNER_IMAGES);

export default function TrustedBy() {
  return (
    <section className="trusted-by" id="trusted-by">
      <Container>
        <div className="trusted-by__inner">
          <h2 className="trusted-by__title">Trusted by Millions</h2>
          <div className="trusted-by__marquee-container">
            <div className="trusted-by__logos">
              {[...PARTNERS, ...PARTNERS].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  className="trusted-by__logo"
                  alt={`Partner ${(i % PARTNERS.length) + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
