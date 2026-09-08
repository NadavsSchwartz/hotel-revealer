import React from 'react';
import { Link } from 'react-router-dom';

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Hotel Revealer home">
      <svg className="brand-symbol" viewBox="0 0 32 36" aria-hidden="true">
        <path d="M3 3h11v30H3zM18 3h11v11H18zM18 18h11v15H18z" fill="currentColor" />
        <path d="m14 14 4 4V3h-4z" fill="var(--blue)" />
      </svg>
      <span className="brand-type">hotel<span>revealer</span></span>
    </Link>
  );
}
