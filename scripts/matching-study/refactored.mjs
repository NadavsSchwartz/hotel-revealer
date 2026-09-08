const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = value => typeof value === 'string' ? value.trim().length > 0
  : typeof value === 'number' && Number.isFinite(value);
// Validate availability without converting the values used by strict equality.
const isNumeric = value => typeof value === 'number' ? Number.isFinite(value)
  : typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value));

function hasComparisonFacts(row) {
  return isRecord(row) && isRecord(row.location) && isRecord(row.ratesSummary) &&
    isRecord(row.hotelFeatures) && isId(row.location.neighborhoodID) &&
    isNumeric(row.starRating) && isNumeric(row.overallGuestRating) && isNumeric(row.totalReviewCount) &&
    Array.isArray(row.hotelFeatures.highlightedAmenities) && Array.isArray(row.amenitiesIcons);
}

export function isValidOffer(row) {
  return hasComparisonFacts(row) && isId(row.pclnId) && isNumeric(row.ratesSummary.minStrikePrice);
}

export function isValidHotel(row) {
  return hasComparisonFacts(row) && isId(row.hotelId) && isNumeric(row.ratesSummary.minPrice) &&
    // Current RTL rows can have a null programName. Leave it untouched: the
    // original condition only excludes the exact string 'Express_Deal'.
    (row.hotelType === 'RTL' ||
      typeof row.ratesSummary.programName === 'string' && row.ratesSummary.programName.trim().length > 0);
}

function matches(offer, hotel) {
  if (hotel.ratesSummary.programName === 'Express_Deal') return false;
  if (offer.starRating !== hotel.starRating) return false;
  if (offer.location.neighborhoodID !== hotel.location.neighborhoodID) return false;
  if (!(offer.overallGuestRating >= Math.floor(hotel.overallGuestRating) &&
        offer.overallGuestRating <= Math.ceil(hotel.overallGuestRating))) return false;
  if (offer.ratesSummary.minStrikePrice !== hotel.ratesSummary.minPrice) return false;
  if (!(offer.totalReviewCount >= Math.floor(hotel.totalReviewCount / 100) * 100 &&
        offer.totalReviewCount <= Math.ceil(hotel.totalReviewCount / 100) * 100)) return false;
  if (JSON.stringify(offer.hotelFeatures.highlightedAmenities) !==
      JSON.stringify(hotel.hotelFeatures.highlightedAmenities)) return false;
  return JSON.stringify(offer.amenitiesIcons) === JSON.stringify(hotel.amenitiesIcons);
}

// Inputs are listing rows from JSON, not normalized domain objects. Validate
// once per observation and retain raw values, array order and duplicate rates.
export function matchRefactored(offers, hotels) {
  const validOffers = offers.filter(isValidOffer);
  const validHotels = hotels.filter(isValidHotel);
  const pairs = [];
  let comparisons = 0;
  for (const offer of validOffers) {
    for (const hotel of validHotels) {
      comparisons += 1;
      if (matches(offer, hotel)) pairs.push([offer.pclnId, hotel.hotelId]);
    }
  }
  return {
    pairs, comparisons,
    rejectedOffers: offers.length - validOffers.length,
    rejectedHotels: hotels.length - validHotels.length,
  };
}
