import React, { useEffect, useRef } from 'react';
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import SearchForm from './traveler/SearchForm.jsx';

const Results = React.lazy(() => import('./traveler/Results.jsx'));
const Details = React.lazy(() => import('./traveler/Details.jsx'));

function RouteLoading({ message }) {
  return (
    <div className="page-shell route-loading" aria-busy="true">
      <p className="eyebrow">A closer look</p>
      <p role="status">{message}</p>
    </div>
  );
}

function Home() {
  return (
    <>
      <section className="home-hero page-shell">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="small-line" /> A clearer look at hidden hotel
            offers
          </p>
          <h1 tabIndex="-1">
            A little more
            <br />
            to <em>go on.</em>
          </h1>
          <p className="hero-intro">
            An unnamed hotel. A handful of clues.
            <br />
            Compare possible hotels, see the evidence, and make room for the
            unknown.
          </p>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="architecture">
            <div className="window-pane pane-one" />
            <div className="window-pane pane-two" />
            <div className="window-pane pane-three" />
            <div className="window-pane pane-four" />
            <div className="window-sill" />
          </div>
          <div className="illustration-caption">
            <span>THE HOTEL IS HIDDEN.</span>
            <span>The clues don’t have to be.</span>
          </div>
          <span className="illustration-index">HR / 01</span>
        </div>
      </section>
      <section
        className="home-search page-shell"
        aria-label="Plan your comparison"
      >
        <SearchForm />
        <p className="availability-note">
          <span className="status-dot" aria-hidden="true" />
          <strong>Live access pending.</strong> Search is not connected to a
          hotel provider yet. No sample offers are shown.
        </p>
      </section>
      <section
        className="method-section page-shell"
        id="how-it-works"
        aria-labelledby="method-title"
      >
        <div className="method-intro">
          <p className="eyebrow">A thoughtful second look</p>
          <h2 id="method-title">
            Less guessing.
            <br />
            More context.
          </h2>
          <p>
            The clues can narrow a shortlist. They can’t promise you a
            particular hotel.
          </p>
        </div>
        <ol className="method-steps">
          <li>
            <span className="step-number">01</span>
            <div>
              <h3>Start with the original offer</h3>
              <p>
                Keep the Express quote, neighborhood, and star rating in view.
                It is the offer you would buy.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">02</span>
            <div>
              <h3>Compare the available clues</h3>
              <p>
                See named candidates alongside supporting evidence and missing
                information. No percentage guesses.
              </p>
            </div>
          </li>
          <li>
            <span className="step-number">03</span>
            <div>
              <h3>Make an informed decision</h3>
              <p>
                Review the limits, then check the original provider’s price and
                booking terms before you commit.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="ground-rule page-shell">
        <span className="asterisk" aria-hidden="true">
          ✳
        </span>
        <div>
          <h2>A shortlist is not a reveal.</h2>
          <p>
            Hotel Revealer compares available evidence. It cannot verify a
            hidden hotel’s identity, guarantee savings, or see every possible
            candidate. You should be comfortable booking the original unnamed
            offer.
          </p>
        </div>
      </section>
    </>
  );
}

function Policy({ privacy }) {
  return (
    <article className="page-shell policy-page">
      <Link to="/" className="back-link">
        ← Back to search
      </Link>
      <p className="eyebrow">The practical details</p>
      <h1 tabIndex="-1">
        {privacy ? 'Privacy, plainly.' : 'Before you use this.'}
      </h1>
      <p className="policy-date">Last updated September 7, 2026</p>
      {privacy ? (
        <>
          <h2>What your search uses</h2>
          <p>
            Your destination, dates, room and adult counts, children’s ages,
            and selected offer and hotel IDs are sent to this
            application’s server when you search or open a candidate. Once
            authorized live access is configured, the necessary trip details may
            also be sent to the hotel provider to retrieve offers.
          </p>
          <p>
            Destination suggestions use a GeoNames catalog held on this server.
            Typing a city or country sends that text to this application, with
            no request to GeoNames or a hotel provider.
          </p>
          <h2>What stays in your browser</h2>
          <p>
            Trip details and candidate IDs appear in the page address. Your open
            comparisons, sort choice, and scroll position are kept in this tab’s
            session storage. Results are held in application memory; a selected
            offer and candidate may also be retained in browser history so you
            can return to your comparison.
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
            When photographs are available, your browser may request them from
            the image host. Opening an original offer takes you to Priceline,
            where its privacy policy applies.
          </p>
          <h2>Current availability</h2>
          <p>
            Live provider access is not currently configured. Searches do not
            return live or simulated hotel offers in the default application.
          </p>
        </>
      ) : (
        <>
          <h2>A comparison tool, not a booking service</h2>
          <p>
            Hotel Revealer helps compare an unnamed Express offer with possible
            named hotels using the available listing clues. It does not sell
            rooms, accept payment, or make reservations.
          </p>
          <h2>Candidates are uncertain</h2>
          <p>
            A supported candidate has matching evidence across the guest rating,
            review count, and amenity clue groups, in addition to the required
            location and star checks. A partial candidate has less supporting
            evidence. Neither label verifies the hidden hotel’s identity. A
            hotel missing required evidence may remain unassessed.
          </p>
          <p>
            Retrieved listings may be incomplete. No candidate, rate, saving,
            availability, or inventory coverage is guaranteed. A separate retail
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
            the original source. Live searches require authorization covering
            this use; no live provider connection is currently configured.
          </p>
          <h2>Supported scope</h2>
          <p>
            The interface supports worldwide destination search, English, US
            dollars, room and adult counts, and children’s ages. Stays are
            limited to 30 nights within the next 365 days. Destination coverage
            does not establish hotel availability. Room assignments and provider
            occupancy rules require verification before live booking links are
            enabled. Booking management is handled by the original provider.
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

function PageBehavior() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(null);
  useEffect(() => {
    if (previousPath.current === location.pathname) return undefined;
    previousPath.current = location.pathname;
    const titles = {
      '/': 'A little more to go on.',
      '/results': 'Your hotel shortlist',
      '/deal': 'Candidate details',
      '/privacy': 'Privacy',
      '/terms': 'Terms of use',
    };
    document.title = `Hotel Revealer — ${titles[location.pathname] || 'Page not found'}`;
    if (navigationType === 'POP' || location.state?.restore) return;
    window.scrollTo(0, 0);
    const frame = requestAnimationFrame(() =>
      (document.querySelector('h1') || document.getElementById('main'))?.focus({
        preventScroll: true,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, navigationType, location.state?.restore]);
  useEffect(() => {
    if (location.hash === '#how-it-works')
      document.getElementById('how-it-works')?.scrollIntoView();
  }, [location.hash, location.pathname]);
  return null;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
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
            href={window.location.pathname + window.location.search}
          >
            Reload page
          </a>
        </main>
      );
    return this.props.children;
  }
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header page-shell">
        <Link className="wordmark" to="/" aria-label="Hotel Revealer home">
          <span className="brand-mark" aria-hidden="true">
            h<span>r</span>
          </span>
          <span>
            hotel<span className="brand-revealer">revealer</span>
            <span className="brand-period">.</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/#how-it-works">
            How it works <span aria-hidden="true">↗</span>
          </Link>
          <span className="header-note">A little more to go on.</span>
        </nav>
      </header>
      <ErrorBoundary>
        <PageBehavior />
        <main id="main" tabIndex="-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/results"
              element={
                <React.Suspense
                  fallback={
                    <RouteLoading message="Loading your hotel shortlist…" />
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
                    <RouteLoading message="Loading your candidate comparison…" />
                  }
                >
                  <Details />
                </React.Suspense>
              }
            />
            <Route path="/privacy" element={<Policy privacy />} />
            <Route path="/terms" element={<Policy />} />
            <Route
              path="*"
              element={
                <div className="page-shell empty-panel">
                  <p className="eyebrow">404 / A wrong turn</p>
                  <h1 tabIndex="-1">This page isn’t here.</h1>
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
      <footer className="site-footer page-shell">
        <div>
          <Link to="/" className="footer-wordmark">
            hotelrevealer.
          </Link>
          <p>Independent comparisons. Clear limits.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms of use</Link>
        </nav>
        <p className="footer-disclosure">
          Not affiliated with Priceline. Candidate identity is never guaranteed.
        </p>
      </footer>
    </>
  );
}
