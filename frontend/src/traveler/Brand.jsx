import React from 'react';
import { Link } from 'react-router-dom';

export function BrandIcon({ className = 'brand-symbol', light = false }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M4 4h8v11h16V4h8v32h-8V23H12v13H4Z" fill="currentColor" />
      <path d="m25 25 3-2v13l-3 2Z" fill="currentColor" />
      {light && <svg x="12" y="23" width="13" height="15" viewBox="0 0 13 15" overflow="hidden">
        <rect className="brand-light" x="3" width="6" height="15" />
      </svg>}
    </svg>
  );
}

export default function Brand({ label = 'Hotel Revealer home', to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label={label}>
      <BrandIcon />
      <span className="brand-type">hotel<span>revealer</span></span>
    </Link>
  );
}
