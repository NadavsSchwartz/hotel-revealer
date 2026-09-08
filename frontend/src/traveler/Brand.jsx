import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand({ variant }) {
  return (
    <Link to="/" className="brand" aria-label="Hotel Revealer home">
      {variant === 'room' ? <svg className="brand-symbol" viewBox="0 0 42 48" aria-hidden="true">
        <path d="M13 3 39 0v35l-26 3zM7 9l26-3v35L7 44zM1 15l26-3v35H1z" fill="none" stroke="currentColor" strokeWidth=".8" />
      </svg> : <svg className="brand-symbol" viewBox="0 0 32 36" aria-hidden="true">
        <path d="M3 3h11v30H3zM18 3h11v11H18zM18 18h11v15H18z" fill="currentColor" />
        <path d="m14 14 4 4V3h-4z" fill="var(--blue)" />
      </svg>}
      <span className="brand-type">hotel<span>revealer</span></span>
    </Link>
  );
}
