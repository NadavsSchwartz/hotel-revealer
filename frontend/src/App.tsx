import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { SearchDraft } from './traveler/SearchForm.tsx';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Home from './traveler/Home.tsx';
import Brand from './traveler/Brand.tsx';
import CurrencySelector, { useCurrency } from './traveler/CurrencySelector.tsx';
import ThemeToggle from './traveler/ThemeToggle.tsx';
import SearchProgress from './traveler/SearchProgress.tsx';
import './traveler/home.css';

const Results = React.lazy(() => import('./traveler/Results.tsx'));
const Details = React.lazy(() => import('./traveler/Details.tsx'));

function RouteLoading({ message, search = false }: { message: string; search?: boolean }) {
  return (
    <div className="page-shell route-loading" aria-busy="true">
      {search ? <SearchProgress variant="preparing" /> : <p className="eyebrow">A closer look</p>}
      <p role="status" className={search ? 'sr-only' : undefined}>{message}</p>
    </div>
  );
}

function Policy({ privacy = false }: { privacy?: boolean }) {
  return (
    <article className="page-shell policy-page">
      <Link to="/" className="back-link">
        ← Back to search
      </Link>
      <p className="eyebrow">The practical details</p>
      <h1 tabIndex={-1}>
        {privacy ? 'Privacy, plainly.' : 'Before you use this.'}
      </h1>
      <p className="policy-date">Last updated September 8, 2026</p>
      {privacy ? (
        <>
          <h2>What your search uses</h2>
          <p>
            Your destination, dates, room and adult counts, children’s ages,
            and selected offer and hotel IDs are sent to this
            application’s server when you search or open an offer. The
            necessary trip details are sent to Priceline to retrieve listings
            and hotel information.
          </p>
          <p>
            Destination suggestions use a GeoNames catalog held on this server.
            Typing a city or country sends that text to this application, with
            no request to GeoNames or a hotel provider.
          </p>
          <h2>What stays in your browser</h2>
          <p>
            Trip details and selected offer and hotel IDs appear in the page address. Your
            sort choice, page and scroll position are kept in this tab’s
            session storage. Your unfinished search and results are held in
            application memory so you can return to your results.
            Your currency and theme choices are saved in local storage on this browser.
          </p>
          <p>
            This application does not require an account and does not include
            analytics, advertising trackers, or an application tracking cookie.
            Your browser may retain its normal browsing history.
          </p>
          <h2>Server and provider requests</h2>
          <p>
            Requests include ordinary network information, such as your IP
            address. Hosting infrastructure may log request metadata. This
            application’s operational logs use request identifiers and error
            codes rather than full trip searches. No booking or payment details
            are collected here.
          </p>
          <p>
            To reopen a recently selected offer after a restart, this server temporarily
            stores a hashed selection reference, the provider’s city ID and an expiry time.
            These records are valid for 30 minutes and are removed when expired while the
            service runs and when it starts. They contain no travel dates, guest counts or
            ages, offer IDs, prices, hotel guesses or booking links.
          </p>
          <p>
            When photographs are available, your browser may request them from
            the image host. Opening an original offer takes you to Priceline,
            where its privacy policy applies.
          </p>
          <h2>Current availability</h2>
          <p>
            Searches use live Priceline responses. Results are cached briefly
            in server memory and can become unavailable or change price.
          </p>
        </>
      ) : (
        <>
          <h2 id="how-it-works">A comparison tool, not a booking service</h2>
          <p>
            Hotel Revealer uses an unnamed Express offer’s listing information
            to infer one likely hotel when the matching rules identify a single hotel. It does not sell
            rooms, accept payment, or make reservations.
          </p>
          <h2>A likely hotel is an inference</h2>
          <p>
            “Likely hotel” means one hotel met the matching rules for the retrieved
            deal information. The name is inferred, not verified or guaranteed.
            When several hotels fit, required information is missing, no hotel fits,
            or the search is incomplete, the offer remains unidentified.
          </p>
          <p>
            Results show only offers with one likely hotel.
            Listing rates may exclude taxes and fees; complete totals are requested
            when you open an offer and may be unavailable. No rate, saving,
            availability or inventory coverage is guaranteed. A separate retail
            quote may describe a different room or booking policy.
          </p>
          <h2>Check the original offer</h2>
          <p>
            Rates and availability can change after retrieval. Review the
            provider’s final total, taxes, fees, dates, room, cancellation
            policy, and booking terms. Book only if you accept the original
            unnamed offer and the provider’s terms.
          </p>
          <h2>Independent project</h2>
          <p>
            Hotel Revealer is an independent portfolio project and is not
            affiliated with or endorsed by Priceline. Provider names identify
            the original source. The service uses a public website interface;
            access and data availability can change.
          </p>
          <h2>Supported scope</h2>
          <p>
            The interface supports worldwide destination search, English,
            the currencies available in the currency selector, room and adult counts,
            and children’s ages. Prices are requested from Priceline in your selected
            currency. Stays are
            limited to 30 nights within the next 365 days. Destination coverage
            does not establish hotel availability. Final room assignments,
            occupancy and charges are confirmed on Priceline before booking.
            Booking management is handled by the original provider.
          </p>
          <p>
            Destination data: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>,
            adapted under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
          </p>
        </>
      )}
    </article>
  );
}

function Credits() {
  return (
    <article className="page-shell policy-page">
      <Link to="/" className="back-link">← Back to search</Link>
      <h1 tabIndex={-1}>Data &amp; credits</h1>
      <h2>Destinations</h2>
      <p>Destination names come from <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>, adapted under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>
      <h2>Photography</h2>
      <p>The homepage doorway is an original generated scene created for Hotel Revealer. It illustrates the idea of revealing a stay and does not represent a hotel result or available offer.</p>
      <h2>Product preview</h2>
      <p>The homepage hotel-details preview uses The STRAT’s name, address and listed amenities from a Priceline property response retrieved on September 8, 2026. It demonstrates available property information, not a confirmed identity for an unnamed offer.</p>
      <h2>Typography</h2>
      <p>Manrope by Mikhail Sharanda and Mirko Velimirovic is distributed under the <a href="/fonts/OFL.txt">SIL Open Font License</a>.</p>
      <p>Bodoni Moda by The Bodoni Moda Project Authors is distributed under the <a href="/fonts/bodoni-LICENSE.txt">SIL Open Font License</a>.</p>
    </article>
  );
}

function PageBehavior() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    const pathChanged = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    const titles: Record<string, string> = {
      '/': 'Your hotel. Out of hiding.',
      '/results': 'Your Express deals',
      '/deal': 'Offer details and price',
      '/privacy': 'Privacy',
      '/terms': 'Terms of use',
      '/credits': 'Data & credits',
    };
    document.title = `Hotel Revealer — ${titles[location.pathname] || 'Page not found'}`;
    if (location.hash) {
      const frame = requestAnimationFrame(() => {
        const hashId = location.hash.slice(1);
        const targetId = location.pathname === '/' && ['questions', 'questions-title'].includes(hashId)
          ? 'how-it-works' : hashId;
        const section = document.getElementById(targetId);
        if (!section) return;
        const labelledBy = section.getAttribute('aria-labelledby')?.split(/\s+/)[0];
        const heading = (labelledBy && document.getElementById(labelledBy))
          || section.querySelector<HTMLElement>('h1, h2, h3') || section;
        if (heading.tabIndex < 0) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        section.scrollIntoView();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!pathChanged) return undefined;
    if (navigationType === 'POP' || location.state?.restore) return;
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() =>
      (document.querySelector('h1') || document.getElementById('main'))?.focus({
        preventScroll: true,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash, navigationType, location.state?.restore]);
  return null;
}

class ErrorBoundary extends React.Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main id="main" className="page-shell empty-panel">
          <h1>We couldn’t display this page</h1>
          <p>
            Please reload to try again. Your trip remains in the page address.
          </p>
          <a
            className="button-link"
            href={window.location.href}
          >
            Reload page
          </a>
        </main>
      );
    return this.props.children;
  }
}

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const homeDraft = useRef<SearchDraft | null>(null);
  const { currency, setCurrency } = useCurrency();
  return (
    <div id="page-top" className={`unboxed-application ${isHome ? 'room-application' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="direction-header">
        <Brand />
        <div className="header-preferences" role="group" aria-label="Display preferences">
          <CurrencySelector currency={currency} onChange={setCurrency} />
          <ThemeToggle />
        </div>
      </header>
      <PageBehavior />
      <ErrorBoundary key={location.pathname}>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home draftRef={homeDraft} currency={currency} />} />
            <Route
              path="/results"
              element={
                <React.Suspense
                  fallback={
                    <RouteLoading message="Preparing your search" search />
                  }
                >
                  <Results />
                </React.Suspense>
              }
            />
            <Route
              path="/deal"
              element={
                <React.Suspense
                  fallback={
                    <RouteLoading message="Loading your offer…" />
                  }
                >
                  <Details />
                </React.Suspense>
              }
            />
            <Route path="/privacy" element={<Policy privacy />} />
            <Route path="/terms" element={<Policy />} />
            <Route path="/credits" element={<Credits />} />
            <Route
              path="*"
              element={
                <div className="page-shell empty-panel">
                  <p className="eyebrow">404 / A wrong turn</p>
                  <h1 tabIndex={-1}>This page isn’t here.</h1>
                  <p>Let’s get you back to planning your stay.</p>
                  <Link to="/" className="button-link">
                    Back to search
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
      </ErrorBoundary>
      <footer className="direction-footer">
        <Brand label="Back to home" to={isHome ? '/#page-top' : '/'} />
        <div className="footer-copy"><span>© 2026 Hotel Revealer</span></div>
        <nav aria-label="Footer navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/credits">Data &amp; credits</Link>
        </nav>
      </footer>
    </div>
  );
}
