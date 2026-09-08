import React from 'react';
import { Link } from 'react-router-dom';
import SearchForm from './SearchForm.jsx';
import './room-home.css';

export default function Home({ draftRef }) {
  return (
    <div className="room-home">
      <section className="room-scene" aria-labelledby="home-title">
        <div className="room-introduction">
          <h1 id="home-title" tabIndex="-1">Find the hotel<br />behind the deal.</h1>
          <p className="room-description">Search Priceline Express Deals by destination and dates. Review the hotel, then book on Priceline.</p>
        </div>
        <section className="room-reception" id="unboxed-search" aria-labelledby="search-title">
          <h2 id="search-title" tabIndex="-1">Your trip</h2>
          <SearchForm draftRef={draftRef} submitLabel="Find hotel deals" />
        </section>
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
        <div className="room-reveal-preview">
          <div className="room-hidden-offer">
            <p className="room-preview-label">Priceline Express Deal</p>
            <h3>A stay without a name.</h3>
            <p className="room-hidden-name">Before the reveal <span aria-hidden="true">↓</span></p>
          </div>
          <div className="room-revealed-hotel">
            <p className="room-preview-label">Hotel Revealer</p>
            <h3>A hotel you can explore.</h3>
            <p>A name and details to help you decide.</p>
          </div>
        </div>
      </section>

      <section className="room-guide" id="how-it-works" aria-labelledby="method-title">
        <div className="room-content">
          <h2 id="method-title" tabIndex="-1">Search. Reveal. Decide.</h2>
          <ol className="room-steps">
            <li><h3>Start with your stay.</h3><p>Choose your destination, dates and travelers to find Priceline Express Deals for your trip.</p></li>
            <li><h3>See behind the offer.</h3><p>See one hotel for each deal we can identify, with its details alongside the original offer.</p></li>
            <li><h3>Make the choice yours.</h3><p>Prices and availability can change. Review the current total, fees and cancellation terms, then book on Priceline.</p></li>
          </ol>
        </div>
      </section>

      <section className="room-stay room-content" aria-labelledby="stay-title">
        <img src="/media/room-stay.webp" alt="Palm trees and hotel balconies overlooking a swimming pool" width="900" height="1125" loading="lazy" decoding="async" />
        <div className="room-stay-copy">
          <h2 id="stay-title">Make the stay part of the trip.</h2>
          <p>A hotel’s name opens up the rest of the decision. Get a feel for the place before you make it yours.</p>
          <dl className="room-stay-details">
            <div><dt>The neighborhood</dt><dd>See how the location fits the places you want to go.</dd></div>
            <div><dt>The atmosphere</dt><dd>Explore the photos, amenities and guest ratings that help you picture your stay.</dd></div>
          </dl>
        </div>
      </section>

      <section className="room-closing room-content" aria-labelledby="closing-title">
        <h2 id="closing-title">Where will you go next?</h2>
        <Link className="room-button" to="/#unboxed-search">Find hotel deals</Link>
      </section>
    </div>
  );
}
