import React from 'react';
import { Link } from 'react-router-dom';
import SearchForm from './SearchForm.jsx';
import './room-home.css';

export default function Home({ draftRef }) {
  return (
    <div className="room-home">
      <section className="room-scene" aria-labelledby="home-title">
        <div className="room-hero-content">
          <div className="room-introduction">
            <h1 id="home-title" tabIndex="-1">Find the hotel<br />behind the deal.</h1>
            <p className="room-description">Search Priceline Express Deals by destination and dates. Review the hotel, then book on Priceline.</p>
          </div>
          <section className="room-reception" id="unboxed-search" aria-labelledby="search-title">
            <h2 id="search-title" tabIndex="-1">Your trip</h2>
            <SearchForm draftRef={draftRef} submitLabel="Find hotel deals" />
            <p className="room-reception-note">If we can’t identify a deal, we’ll say so.</p>
          </section>
        </div>
        <figure className="room-view">
          <picture>
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.webp" type="image/webp" />
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.avif" type="image/avif" />
            <source srcSet="/media/room-terrace.avif" type="image/avif" />
            <img src="/media/room-terrace.webp" alt="" width="1536" height="1024" />
          </picture>
        </figure>
      </section>
      <section className="room-example room-content" id="reveal-example" aria-labelledby="reveal-title">
        <div className="room-example-intro">
          <h2 id="reveal-title" tabIndex="-1">A great rate is only half the story.</h2>
          <p>See the hotel behind an Express Deal, then decide if it’s the right stay for you.</p>
        </div>
        <figure className="room-reveal-preview">
          <div className="room-hidden-offer">
            <p className="room-preview-label">Priceline Express Deal</p>
            <h3>4-star hotel in Downtown</h3>
            <p className="room-hidden-name">Hotel name hidden <span aria-hidden="true">↓</span></p>
          </div>
          <div className="room-revealed-hotel">
            <p className="room-preview-label">Hotel identified</p>
            <h3>The Paloma</h3>
            <p>Downtown · 4-star hotel</p>
          </div>
          <figcaption>Fictional example · Not a live offer</figcaption>
        </figure>
      </section>

      <section className="room-guide" id="how-it-works" aria-labelledby="method-title">
        <div className="room-content">
          <h2 id="method-title" tabIndex="-1">Search. Reveal. Decide.</h2>
          <ol className="room-steps">
            <li><h3>Start with your stay.</h3><p>Choose your destination, dates and travelers to find Priceline Express Deals for your trip.</p></li>
            <li><h3>See behind the offer.</h3><p>See one hotel for each deal we can identify. If we can’t identify it, we’ll say so.</p></li>
            <li><h3>Make the choice yours.</h3><p>Prices and availability can change. Review the current total, fees and cancellation terms, then book on Priceline.</p></li>
          </ol>
        </div>
      </section>

      <section className="room-closing room-content" aria-labelledby="closing-title">
        <h2 id="closing-title">Where will you go next?</h2>
        <Link className="room-button" to="/#unboxed-search">Find hotel deals</Link>
      </section>
    </div>
  );
}
