import React, { useEffect, useState } from 'react';
import './progress.css';

export default function SearchProgress() {
  const [showMotion, setShowMotion] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowMotion(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return <section className={`search-progress${showMotion ? ' search-progress-ready' : ''}`} aria-busy="true" aria-label="Hotel search progress">
    <div className="search-progress-wordmark" aria-hidden="true">
      <span>hotel</span>
      <div><strong>revealer</strong><i /></div>
    </div>
    <h2>Finding your hotel matches</h2>
    <p>Comparing the area, guest ratings and listed features.</p>
    <span className="search-progress-signal" aria-hidden="true"><i /><i /><i /></span>
  </section>;
}
