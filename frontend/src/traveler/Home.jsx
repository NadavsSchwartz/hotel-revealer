import React from 'react';
import { Link } from 'react-router-dom';
import SearchForm from './SearchForm.jsx';
import './room-home.css';

export default function Home({ draftRef, currency }) {
  return (
    <div className="room-home">
      <section className="room-scene" aria-labelledby="home-title">
        <div className="room-introduction">
          <h1 id="home-title" tabIndex="-1">Your hotel.<br />Out of hiding.</h1>
          <p className="room-description">Explore the likely hotel behind a Priceline Express Deal before you book.</p>
        </div>
        <section className="room-reception" id="unboxed-search" aria-labelledby="search-title">
          <h2 id="search-title" tabIndex="-1">Start with your trip</h2>
          <SearchForm draftRef={draftRef} currency={currency} submitLabel="Find hotel deals" />
        </section>
        <figure className="room-view">
          <picture>
            <source media="(max-width: 650px)" srcSet="/media/room-doorway-mobile.webp" type="image/webp" />
            <source srcSet="/media/room-doorway.avif" type="image/avif" />
            <img src="/media/room-doorway.webp" alt="" width="1280" height="853" decoding="async" />
          </picture>
        </figure>
      </section>
      <section className="room-example room-content" id="reveal-example" aria-labelledby="reveal-title">
        <div className="room-example-copy">
          <p className="room-kicker">Inside a hotel result</p>
          <h2 id="reveal-title" tabIndex="-1">A name opens<br />up the picture.</h2>
          <p className="room-example-description">A likely hotel gives you somewhere to look closer. See the place behind the offer before deciding whether it fits your trip.</p>
          <div className="room-preview-benefits">
            <div><h3>Put the location in context.</h3><p>Check the address against the places you want to be.</p></div>
            <div><h3>Find the details that matter.</h3><p>Explore available amenities and property information beyond the star rating.</p></div>
          </div>
        </div>
        <article className="room-property-preview" aria-label="Hotel details preview">
          <div className="room-preview-header"><span>Hotel details</span><span>Preview</span></div>
          <div className="room-property-body">
            <p className="room-property-location">Las Vegas, Nevada</p>
            <h3>The STRAT<br /><span>Hotel, Casino &amp; Tower</span></h3>
            <div className="room-property-address">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
              <div><h4>Address</h4><p>2000 Las Vegas Blvd. S.</p></div>
            </div>
            <div className="room-property-amenities">
              <h4>Listed amenities</h4>
              <ul><li>Swimming pool</li><li>Restaurant</li><li>Fitness center</li></ul>
            </div>
          </div>
        </article>
      </section>

      <section className="room-guide room-content" id="how-it-works" aria-labelledby="method-title">
        <h2 id="method-title" tabIndex="-1">Three steps.<br />A clearer choice.</h2>
        <ol className="room-steps">
          <li><h3>Pick your trip.</h3><p>Enter your destination, dates and travelers to search Priceline Express Deals.</p></li>
          <li><h3>Look behind the offer.</h3><p>Explore one likely hotel and its available details. Deals that can’t be resolved stay unidentified.</p></li>
          <li><h3>Decide, then book.</h3><p>Check the total price, then review the room and booking terms on Priceline.</p></li>
        </ol>
      </section>

      <section className="room-closing room-content" aria-labelledby="closing-title">
        <h2 id="closing-title">Take a closer look.</h2>
        <Link className="room-button" to="/#unboxed-search">Find hotel deals <span aria-hidden="true">↗</span></Link>
      </section>
    </div>
  );
}
