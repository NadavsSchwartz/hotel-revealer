import React from 'react';
import { Link } from 'react-router-dom';
import SearchForm from './SearchForm.jsx';

export default function Home() {
  return (
    <div className="unboxed-direction">
      <section className="unboxed-hero" aria-labelledby="home-title">
        <picture className="unboxed-photo">
          <source media="(max-width: 700px)" srcSet="/media/stay-hero-mobile.avif" type="image/avif" />
          <source media="(max-width: 700px)" srcSet="/media/stay-hero-mobile.webp" type="image/webp" />
          <source srcSet="/media/stay-hero.avif" type="image/avif" />
          <img src="/media/stay-hero.webp" alt="Palm-lined hotel pool" width="1600" height="950" />
        </picture>
        <div className="unboxed-shade" />
        <div className="unboxed-side-label" aria-hidden="true">SEE THE STAY / KEEP THE DEAL</div>
        <div className="unboxed-copy">
          <p className="overline">PRICELINE EXPRESS DEALS, IN FOCUS.</p>
          <h1 id="home-title" tabIndex="-1">A great deal.<br /><span>A clearer picture.</span></h1>
          <p>Compare hotel matches for your Express Deal.<br />See the clues. Book the original offer.</p>
          <a href="#unboxed-search" className="unboxed-start">Start your search <span aria-hidden="true">↘</span></a>
        </div>
        <div className="unboxed-edge" aria-hidden="true"><span>HR</span><i /></div>
      </section>
      <section className="unboxed-search" id="unboxed-search" aria-labelledby="search-title">
        <div className="unboxed-search-intro">
          <strong id="search-title">Your next stay starts here.</strong>
          <span>City, dates, travelers. We’ll connect the clues.</span>
        </div>
        <SearchForm />
      </section>
      <section className="unboxed-story" id="how-it-works" aria-labelledby="method-title">
        <h2 id="method-title">The price is only<br />half the story.</h2>
        <div>
          <p>See possible hotels alongside the location, ratings and amenities that connect them to an Express Deal. Compare the clues, then book the original unnamed offer on Priceline.</p>
          <Link to="/terms#how-it-works">See how it works <span aria-hidden="true">↗</span></Link>
        </div>
        <span className="story-mark" aria-hidden="true">↗</span>
      </section>
    </div>
  );
}
