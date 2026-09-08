import React from 'react';
import { Link } from 'react-router-dom';
import SearchForm from './SearchForm.jsx';
import './room-home.css';

export default function Home({ draftRef }) {
  return (
    <div className="room-home">
      <section className="room-scene" aria-labelledby="home-title">
        <div className="room-view" aria-hidden="true">
          <picture>
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.avif" type="image/avif" />
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.webp" type="image/webp" />
            <source srcSet="/media/room-terrace.avif" type="image/avif" />
            <img src="/media/room-terrace.webp" alt="" width="1536" height="1024" />
          </picture>
        </div>
        <div className="room-introduction">
          <p className="room-eyebrow">Before you book</p>
          <h1 id="home-title" tabIndex="-1">A room with<br /><em>fewer unknowns.</em></h1>
          <p className="room-description">Find the hotel behind a <strong>Priceline Express Deal</strong> before you book.</p>
        </div>
        <section className="room-reception" id="unboxed-search" aria-labelledby="search-title">
          <h2 id="search-title" tabIndex="-1">Where are you<br /> checking in?</h2>
          <SearchForm draftRef={draftRef} submitLabel="Find hotel deals" />
          <p className="room-reception-note">If we can’t identify a deal, we’ll say so.</p>
        </section>
        <div className="room-scene-bottom">
          <Link to="/#how-it-works">How the reveal works <span aria-hidden="true" /></Link>
          <Link to="/credits">Imagined hotel scene · Credits</Link>
        </div>
      </section>
      <section className="room-summary room-content" id="how-it-works" aria-labelledby="method-title">
        <h2 id="method-title" tabIndex="-1">The hotel behind the deal.</h2>
        <p>Choose your trip, see the identified hotel, and review the original offer on Priceline before booking.</p>
        <Link to="/terms#how-it-works">See how it works</Link>
        <Link to="/#unboxed-search">Start your search</Link>
      </section>
    </div>
  );
}
