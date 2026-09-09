import { useEffect, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { CURRENCIES, isCurrency } from '../../../shared/currency.ts';
import { parseOfferSort } from './context.ts';
import './preferences.css';

const STORAGE_KEY = 'hotel-revealer:currency';

function savedCurrency() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isCurrency(value)) return value;
  } catch { /* Preferences are optional when storage is unavailable. */ }
  return 'USD';
}

export function useCurrency() {
  const location = useLocation();
  const navigate = useNavigate();
  const [preference, setPreference] = useState(savedCurrency);
  const resultsRoute = useMatch('/results');
  const detailRoute = useMatch('/deal');
  const tripRoute = resultsRoute || detailRoute;
  // Shared links and browser history retain the currency of that trip.
  const currency = tripRoute ? new URLSearchParams(location.search).get('currency') ?? 'USD' : preference;

  useEffect(() => {
    if (!isCurrency(currency)) return;
    setPreference(currency);
    try { localStorage.setItem(STORAGE_KEY, currency); }
    catch { /* Search still works without browser storage. */ }
  }, [currency]);

  function setCurrency(value: string) {
    if (!isCurrency(value) || value === currency) return;
    setPreference(value);
    if (tripRoute) {
      const params = new URLSearchParams(location.search);
      params.set('currency', value);
      params.delete('page');
      if (detailRoute) {
        // Provider offer IDs change with currency; retrieve fresh offers before selecting one.
        params.delete('offerId');
        params.delete('hotelId');
        const resultsUrl = location.state?.resultsUrl;
        const sort = typeof resultsUrl === 'string' ? new URLSearchParams(resultsUrl.split('?')[1]).get('sort') : null;
        params.set('sort', parseOfferSort(sort));
      }
      void navigate({ pathname: detailRoute ? '/results' : location.pathname, search: `?${params}` });
    }
  }

  return { currency, setCurrency };
}

export default function CurrencySelector({ currency, onChange }: { currency: string; onChange: (value: string) => void }) {
  return (
    <label className="currency-selector">
      <span className="sr-only">Currency</span>
      <select value={currency} onChange={event => onChange(event.target.value)}>
        {!isCurrency(currency) && <option value={currency} disabled>Choose currency</option>}
        {Object.entries(CURRENCIES).map(([code, name]) => <option key={code} value={code} label={code}>{code} — {name}</option>)}
      </select>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </label>
  );
}
