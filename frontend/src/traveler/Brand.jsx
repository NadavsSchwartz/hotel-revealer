import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand({ label = 'Hotel Revealer home', to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label={label}>
      <svg className="brand-symbol" viewBox="0 0 42 48" aria-hidden="true">
        <path d="M13 3 39 0v35l-26 3zM7 9l26-3v35L7 44zM1 15l26-3v35H1z" fill="none" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <span className="brand-type">hotel<span>revealer</span></span>
    </Link>
  );
}
