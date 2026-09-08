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
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.webp" type="image/webp" />
            <source media="(max-width: 650px)" srcSet="/media/room-terrace-mobile.avif" type="image/avif" />
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
          <Link to="/#reveal-example">See a reveal <span aria-hidden="true" /></Link>
          <Link to="/credits">Imagined hotel scene · Credits</Link>
        </div>
      </section>
      <section className="room-example room-content" id="reveal-example" aria-labelledby="reveal-title">
        <div className="room-example-intro">
          <div>
            <p className="room-eyebrow">Illustrative example — fictional hotel and details</p>
            <h2 id="reveal-title" tabIndex="-1">The name behind the stay.</h2>
          </div>
          <p>An unnamed offer. One hotel, revealed. See the hotel’s name with the offer details alongside it.</p>
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
        <div className="room-example-closing">
          <p>This example is not a live offer.</p>
          <Link className="room-text-link" to="/#unboxed-search">Start with your trip</Link>
        </div>
      </section>

      <section className="room-workflow room-content" id="how-it-works" aria-labelledby="method-title">
        <figure className="room-workflow-visual">
          <img src="/media/room-stay.webp" alt="Hotel balconies and palms overlooking a quiet swimming pool" width="900" height="1125" loading="lazy" decoding="async" />
          <figcaption>Travel inspiration, not a hotel result.</figcaption>
        </figure>
        <div className="room-workflow-copy">
          <p className="room-eyebrow">From your first search to your next stay</p>
          <h2 id="method-title" tabIndex="-1">A place in mind.<br /><em>A more informed choice.</em></h2>
          <ol className="room-steps">
            <li><h3>Start with your trip.</h3><p>Choose where you’re going, when you’re staying, and who’s coming. We look for Express Deals for that trip.</p></li>
            <li><h3>See the hotel behind the deal.</h3><p>For each deal we can identify, we show one hotel with its details. If we can’t identify it, we’ll say so.</p></li>
            <li><h3>Check the original offer.</h3><p>Review the final price, room, fees, and cancellation terms on Priceline before booking.</p></li>
          </ol>
          <Link className="room-text-link" to="/#unboxed-search">Start with your destination</Link>
        </div>
      </section>

      <section className="room-questions" id="questions" aria-labelledby="questions-title">
        <div className="room-content room-questions-inner">
          <div className="room-questions-intro">
            <p className="room-eyebrow">The practical details</p>
            <h2 id="questions-title" tabIndex="-1">Before<br /> <em>you book.</em></h2>
            <p>A clearer picture of the hotel. A few practical things to know before reserving your stay.</p>
            <span className="room-quiet-mark" aria-hidden="true" />
          </div>
          <div className="room-question-list">
            <details open><summary>What does a reveal show?</summary><p>One identified hotel for an Express Deal, with its details alongside the offer. A trip can return several deals, each with its own result.</p></details>
            <details><summary>What if you can’t identify the hotel?</summary><p>We say so. Some deals don’t have enough information to identify the hotel, and we don’t turn an unresolved deal into a reveal.</p></details>
            <details><summary>Do I book my stay here?</summary><p>Booking takes place on Priceline. Check the final total, room details, dates, and cancellation terms there before paying.</p></details>
            <details><summary>Can the price change?</summary><p>Yes. Rates and availability can change after your search. Check taxes, fees, and the final total on the original offer. A separate retail quote may describe a different room or booking policy.</p></details>
            <details><summary>Are you part of Priceline?</summary><p>No. Hotel Revealer is an independent project, not affiliated with or endorsed by Priceline. Priceline supplies the original offers and handles reservations.</p></details>
            <Link className="room-text-link" to="/terms#how-it-works">Read the full terms</Link>
          </div>
        </div>
      </section>

      <section className="room-closing room-content" aria-labelledby="closing-title">
        <div><p className="room-eyebrow">Your next stay</p><h2 id="closing-title">A room in mind.<br /><em>A good place to begin.</em></h2></div>
        <Link className="room-button" to="/#unboxed-search">Find hotel deals</Link>
      </section>
    </div>
  );
}
