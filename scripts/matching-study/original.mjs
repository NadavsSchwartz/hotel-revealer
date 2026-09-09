// Independent synchronous reference: the conjunction in
// 728f9ed:backend/util/helpers.js. Deliberately retains legacy coercion and
// JSON.stringify equality; callers supply complete rows for parity comparisons.
const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function originalMatches(offer, hotel) {
  return hotel.ratesSummary.programName !== 'Express_Deal' &&
    offer.starRating === hotel.starRating &&
    offer.location.neighborhoodID === hotel.location.neighborhoodID &&
    offer.overallGuestRating >= Math.floor(hotel.overallGuestRating) &&
    offer.overallGuestRating <= Math.ceil(hotel.overallGuestRating) &&
    offer.ratesSummary.minStrikePrice === hotel.ratesSummary.minPrice &&
    offer.totalReviewCount >= Math.floor(hotel.totalReviewCount / 100) * 100 &&
    offer.totalReviewCount <= Math.ceil(hotel.totalReviewCount / 100) * 100 &&
    isEqual(offer.hotelFeatures.highlightedAmenities, hotel.hotelFeatures.highlightedAmenities) &&
    isEqual(offer.amenitiesIcons, hotel.amenitiesIcons);
}

export function matchOriginal(offers, hotels) {
  const pairs = [];
  for (const offer of offers) {
    for (const hotel of hotels) {
      if (originalMatches(offer, hotel)) pairs.push([offer.pclnId, hotel.hotelId]);
    }
  }
  return pairs;
}
