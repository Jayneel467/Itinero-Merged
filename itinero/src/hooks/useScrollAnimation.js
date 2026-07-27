import { useEffect } from "react";

/**
 * Observes elements with [data-animate] attribute and adds
 * the 'is-visible' class when they enter the viewport.
 */
export default function useScrollAnimation() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            // Once visible, stop observing (animation fires once)
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12, // Trigger when 12% of element is visible
        rootMargin: "0px 0px -50px 0px", // Slightly before bottom of viewport
      }
    );

    const elements = document.querySelectorAll("[data-animate]");
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);
}
