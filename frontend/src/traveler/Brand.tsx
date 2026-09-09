import { Link } from 'react-router-dom';

export function BrandIcon({ className = 'brand-symbol' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-2 -2 44 44" aria-hidden="true" focusable="false">
      <path className="brand-lens" d="M18.797 2.998A10.6 16.8 20 1 0 7.586 33.798L9.015 29.873A6.8 13 20 1 1 17.368 6.922Z" fill="currentColor" />
      <path className="brand-lens brand-lens-right" d="M21.203 37.002A10.6 16.8 20 1 0 32.414 6.202L30.985 10.127A6.8 13 20 1 1 22.632 33.078Z" fill="currentColor" />
    </svg>
  );
}

export default function Brand({ label = 'Hotel Revealer home', to = '/' }: { label?: string; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label={label}>
      <BrandIcon />
      <span className="brand-type">hotel<span>revealer</span></span>
    </Link>
  );
}
