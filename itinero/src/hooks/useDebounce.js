import { useState, useEffect } from "react";

/**
 * Hook to debounce a rapidly-changing value.
 * Essential for search inputs to avoid firing API calls on every keystroke.
 *
 * Usage:
 *   const [search, setSearch] = useState('');
 *   const debouncedSearch = useDebounce(search, 300);
 *   useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 *
 * @param {*} value - The value to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {*} The debounced value
 */
export default function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
