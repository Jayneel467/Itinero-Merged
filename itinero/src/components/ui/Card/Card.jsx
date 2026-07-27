import React from "react";
import "./Card.css";

/**
 * Generic card wrapper with optional shadow and hover effects.
 */
export default function Card({
  shadow = true,
  bordered = false,
  rounded = "3xl",
  className = "",
  children,
  style,
  ...props
}) {
  const classes = [
    "card",
    shadow && "card--shadow",
    bordered && "card--bordered",
    `card--rounded-${rounded}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style} {...props}>
      {children}
    </div>
  );
}
