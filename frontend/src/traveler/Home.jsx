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
          <div>
            <p className="room-eyebrow">Fictional example · Not a live offer</p>
            <h2 id="reveal-title" tabIndex="-1">What a reveal shows</h2>
          </div>
          <p>The hotel’s name, with the offer details alongside it.</p>
        </div>
        <div className="room-folio">
          <div className="room-reveal-name">
            <p className="room-eyebrow">Hotel identified</p>
            <h3>The Paloma</h3>
            <p>Downtown · 4-star hotel</p>
          </div>
          <table className="room-example-table">
            <caption className="sr-only">Supporting details for the fictional unnamed offer and The Paloma.</caption>
            <colgroup><col className="room-criterion" /><col /><col /></colgroup>
            <thead><tr><th scope="col">The details</th><th scope="col">Unnamed offer</th><th scope="col">Identified hotel</th></tr></thead>
            <tbody>
              <tr><th scope="row">Area</th><td>Downtown</td><td>Downtown</td></tr>
              <tr><th scope="row">Star rating</th><td>4 stars</td><td>4 stars</td></tr>
              <tr><th scope="row">Guest rating</th><td>8.5+ / 10</td><td>9.1 / 10</td></tr>
              <tr><th scope="row">Reviews</th><td>300+</td><td>648</td></tr>
              <tr><th scope="row">Amenities</th><td>Pool · Wi-Fi</td><td>Pool · Wi-Fi</td></tr>
            </tbody>
          </table>
          <p className="room-example-note">These details accompany the result. They do not establish a hotel’s identity on their own.</p>
        </div>
      </section>

      <section className="room-workflow room-content" id="how-it-works" aria-labelledby="method-title">
        <h2 id="method-title" tabIndex="-1">How it works</h2>
        <ol className="room-steps">
          <li><h3>Start with your trip.</h3><p>Choose where you’re going, when you’re staying, and who’s coming. We look for Express Deals for that trip.</p></li>
          <li><h3>See the hotel behind the deal.</h3><p>For each deal we can identify, we show one hotel with its details. If we can’t identify it, we’ll say so.</p></li>
          <li><h3>Check the original offer.</h3><p>Review the final price, room, fees, and cancellation terms on Priceline before booking.</p></li>
        </ol>
      </section>

      <section className="room-questions" id="questions" aria-labelledby="questions-title">
        <div className="room-content room-questions-inner">
          <div className="room-questions-intro">
            <h2 id="questions-title" tabIndex="-1">Good to know</h2>
          </div>
          <div className="room-question-list">
            <details><summary>What does a reveal show?</summary><p>One identified hotel for an Express Deal, with its details alongside the offer. A trip can return several deals, each with its own result.</p></details>
            <details><summary>What if you can’t identify the hotel?</summary><p>We say so. Some deals don’t have enough information to identify the hotel, and we don’t turn an unresolved deal into a reveal.</p></details>
            <details><summary>Do I book my stay here?</summary><p>Booking takes place on Priceline. Check the final total, room details, dates, and cancellation terms there before paying.</p></details>
            <details><summary>Can the price change?</summary><p>Yes. Rates and availability can change after your search. Check taxes, fees, and the final total on the original offer. A separate retail quote may describe a different room or booking policy.</p></details>
            <details><summary>Are you part of Priceline?</summary><p>No. Hotel Revealer is an independent project, not affiliated with or endorsed by Priceline. Priceline supplies the original offers and handles reservations.</p></details>
          </div>
        </div>
      </section>

      <section className="room-closing room-content" aria-labelledby="closing-title">
        <h2 id="closing-title">Where will you go next?</h2>
        <Link className="room-button" to="/#unboxed-search">Find hotel deals</Link>
      </section>
    </div>
  );
}
