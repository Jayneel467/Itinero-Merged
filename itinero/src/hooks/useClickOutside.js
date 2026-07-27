import { useEffect } from "react";

/**
 * Hook to detect clicks outside a referenced element.
 * Perfect for closing dropdowns, modals, and popovers.
 *
 * Usage:
 *   const dropdownRef = useRef(null);
 *   useClickOutside(dropdownRef, () => setIsOpen(false));
 *   return <div ref={dropdownRef}>...</div>;
 *
 * @param {React.RefObject} ref - Ref attached to the target element
 * @param {Function} handler - Callback fired when clicking outside
 */
export default function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      // Do nothing if clicking ref's element or its descendants
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}
