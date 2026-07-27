/**
 * ClassName merge utility.
 * Combines multiple class names, filtering out falsy values.
 *
 * Usage:
 *   cn('btn', isActive && 'btn--active', className)
 *   // → "btn btn--active extra-class"
 *
 * @param {...(string|boolean|null|undefined)} classes
 * @returns {string} Merged class string
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
