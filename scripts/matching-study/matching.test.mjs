import test from 'node:test';
import assert from 'node:assert/strict';
import { originalMatches, matchOriginal } from './original.mjs';
import { isValidOffer, isValidHotel, matchRefactored } from './refactored.mjs';

const hotel = (fields = {}) => ({
  hotelId: 101, starRating: 4, overallGuestRating: 8.4, totalReviewCount: 1254,
  location: { neighborhoodID: 'area-a' },
  ratesSummary: { programName: 'Retail', minPrice: 150 },
  hotelFeatures: { highlightedAmenities: ['POOL', 'WIFI'] },
  amenitiesIcons: [{ iconName: 'pool', amenityName: 'Pool' }, { iconName: 'wifi', amenityName: 'Internet' }],
  ...fields,
});
const offer = (fields = {}) => ({
  ...hotel(), pclnId: 'offer-a', overallGuestRating: 8, totalReviewCount: 1200,
  ratesSummary: { programName: 'Express_Deal', minStrikePrice: 150 },
  ...fields,
});

function expectPairs(offers, hotels, expected) {
  assert.deepEqual(matchOriginal(offers, hotels), expected);
  assert.deepEqual(matchRefactored(offers, hotels).pairs, expected);
}

test('the independent reference preserves every original rejection condition', () => {
  assert.equal(originalMatches(offer(), hotel()), true);
  const rejectedHotels = [
    hotel({ ratesSummary: { programName: 'Express_Deal', minPrice: 150 } }),
    hotel({ starRating: 5 }),
    hotel({ location: { neighborhoodID: 'area-b' } }),
    hotel({ overallGuestRating: 9.1 }),
    hotel({ overallGuestRating: 6.9 }),
    hotel({ ratesSummary: { programName: 'Retail', minPrice: 151 } }),
    hotel({ totalReviewCount: 1301 }),
    hotel({ totalReviewCount: 1099 }),
    hotel({ hotelFeatures: { highlightedAmenities: ['WIFI', 'POOL'] } }),
    hotel({ amenitiesIcons: [{ iconName: 'pool', amenityName: 'Different label' }] }),
  ];
  for (const rejected of rejectedHotels) {
    assert.equal(isValidHotel(rejected), true);
    expectPairs([offer()], [rejected], []);
  }
});

test('rating floor and ceiling are inclusive and equal at an integer', () => {
  for (const [rating, expected] of [[7.999, false], [8, true], [8.5, true], [9, true], [9.001, false]]) {
    expectPairs([offer({ overallGuestRating: rating })], [hotel()], expected ? [['offer-a', 101]] : []);
  }
  for (const rating of [7.999, 8, 8.001]) {
    expectPairs([offer({ overallGuestRating: rating })], [hotel({ overallGuestRating: 8 })],
      rating === 8 ? [['offer-a', 101]] : []);
  }
});

test('review hundred boundaries are inclusive and equal at exact hundreds', () => {
  for (const [reviews, expected] of [[1199, false], [1200, true], [1254, true], [1300, true], [1301, false]]) {
    expectPairs([offer({ totalReviewCount: reviews })], [hotel()], expected ? [['offer-a', 101]] : []);
  }
  for (const reviews of [1199, 1200, 1201]) {
    expectPairs([offer({ totalReviewCount: reviews })], [hotel({ totalReviewCount: 1200 })],
      reviews === 1200 ? [['offer-a', 101]] : []);
  }
});

test('numeric strings retain legacy relational coercion and strict price, star and neighborhood types', () => {
  const typedOffer = offer({ starRating: '4', overallGuestRating: '8', totalReviewCount: '1200',
    location: { neighborhoodID: '12' }, ratesSummary: { minStrikePrice: '150' } });
  const typedHotel = hotel({ starRating: '4', overallGuestRating: '8.4', totalReviewCount: '1254',
    location: { neighborhoodID: '12' }, ratesSummary: { programName: 'Retail', minPrice: '150' } });
  expectPairs([typedOffer], [typedHotel], [['offer-a', 101]]);
  for (const differing of [
    { starRating: 4 }, { location: { neighborhoodID: 12 } },
    { ratesSummary: { programName: 'Retail', minPrice: 150 } },
    { ratesSummary: { programName: 'Retail', minPrice: '150.0' } },
  ]) expectPairs([typedOffer], [{ ...typedHotel, ...differing }], []);
  expectPairs([offer({ overallGuestRating: '8', totalReviewCount: '1200' })], [hotel()], [['offer-a', 101]]);
  expectPairs([offer()], [hotel({ ratesSummary: { programName: 'EXPRESS_DEAL', minPrice: 150 } })], [['offer-a', 101]]);
});

test('amenity order, duplicate entries, icon array order and icon property order remain significant', () => {
  for (const changed of [
    { hotelFeatures: { highlightedAmenities: ['WIFI', 'POOL'] } },
    { hotelFeatures: { highlightedAmenities: ['POOL', 'WIFI', 'WIFI'] } },
    { amenitiesIcons: hotel().amenitiesIcons.toReversed() },
    { amenitiesIcons: [{ amenityName: 'Pool', iconName: 'pool' }, hotel().amenitiesIcons[1]] },
    { amenitiesIcons: [{ ...hotel().amenitiesIcons[0], __typename: 'AmenityIcon' }, hotel().amenitiesIcons[1]] },
  ]) expectPairs([offer()], [hotel(changed)], []);
  const empty = { hotelFeatures: { highlightedAmenities: [] }, amenitiesIcons: [] };
  expectPairs([offer(empty)], [hotel(empty)], [['offer-a', 101]]);
});

test('raw RTL rows retain null program names and the exact Express exclusion', () => {
  for (const programName of [null, undefined, 'Retail', 'EXPRESS_DEAL']) {
    const row = hotel({ hotelType: 'RTL', ratesSummary: { programName, minPrice: 150 } });
    assert.equal(isValidHotel(row), true);
    expectPairs([offer()], [row], [['offer-a', 101]]);
  }
  const express = hotel({ hotelType: 'RTL', ratesSummary: { programName: 'Express_Deal', minPrice: 150 } });
  assert.equal(isValidHotel(express), true);
  expectPairs([offer()], [express], []);
  assert.equal(isValidHotel(hotel({ ratesSummary: { programName: null, minPrice: 150 } })), false);
});

test('zero, one and multiple distinct hotels remain separate from duplicate rate observations', () => {
  expectPairs([], [hotel()], []);
  expectPairs([offer()], [], []);
  expectPairs([offer()], [hotel({ starRating: 5 })], []);
  expectPairs([offer()], [hotel()], [['offer-a', 101]]);
  const hotels = [hotel({ hotelId: 102 }), hotel(), hotel({ hotelId: 102 })];
  expectPairs([offer()], hotels, [['offer-a', 102], ['offer-a', 101], ['offer-a', 102]]);
  expectPairs([offer(), offer({ pclnId: 'offer-b' }), offer()], hotels,
    ['offer-a', 'offer-b', 'offer-a'].flatMap(id => [[id, 102], [id, 101], [id, 102]]));
  expectPairs([offer()], [hotel({ hotelId: '101' }), hotel()], [['offer-a', '101'], ['offer-a', 101]]);
});

test('incomplete required facts are rejected instead of matching equal absences', () => {
  const commonMissing = [
    { starRating: undefined }, { starRating: null }, { starRating: NaN },
    { overallGuestRating: null }, { overallGuestRating: '' }, { overallGuestRating: Infinity },
    { totalReviewCount: undefined }, { totalReviewCount: 'not-a-number' },
    { location: null }, { location: {} }, { location: { neighborhoodID: '' } },
    { ratesSummary: null }, { hotelFeatures: null }, { hotelFeatures: {} },
    { hotelFeatures: { highlightedAmenities: null } }, { amenitiesIcons: undefined }, { amenitiesIcons: null },
  ];
  for (const missing of commonMissing) {
    const invalidOffer = offer(missing);
    const invalidHotel = hotel(missing);
    assert.equal(isValidOffer(invalidOffer), false);
    assert.equal(isValidHotel(invalidHotel), false);
    assert.deepEqual(matchRefactored([invalidOffer], [invalidHotel]),
      { pairs: [], comparisons: 0, rejectedOffers: 1, rejectedHotels: 1 });
  }
  for (const invalid of [null, {}, offer({ pclnId: '' }), offer({ ratesSummary: {} }), offer({ ratesSummary: { minStrikePrice: null } })]) {
    assert.equal(isValidOffer(invalid), false);
    assert.equal(matchRefactored([invalid], [hotel()]).rejectedOffers, 1);
  }
  for (const invalid of [null, {}, hotel({ hotelId: null }), hotel({ ratesSummary: { minPrice: 150 } }),
    hotel({ ratesSummary: { programName: 'Retail' } })]) {
    assert.equal(isValidHotel(invalid), false);
    assert.equal(matchRefactored([offer()], [invalid]).rejectedHotels, 1);
  }
  const absent = { starRating: undefined, location: {}, ratesSummary: { programName: 'Retail' },
    hotelFeatures: {}, amenitiesIcons: undefined };
  assert.equal(originalMatches(offer(absent), hotel(absent)), true);
  assert.deepEqual(matchRefactored([offer(absent)], [hotel(absent)]).pairs, []);
});

test('comparison counts describe valid observation pairs and inputs remain unchanged', () => {
  const offers = [offer(), offer({ location: { neighborhoodID: 'area-b' } })];
  const hotels = [hotel(), hotel({ location: { neighborhoodID: 'area-b' } }),
    hotel({ starRating: 5 }), hotel({ starRating: '4' }),
    hotel({ ratesSummary: { programName: 'Express_Deal', minPrice: 150 } })];
  const before = structuredClone({ offers, hotels });
  const result = matchRefactored(offers, hotels);
  assert.deepEqual(result.pairs, matchOriginal(offers, hotels));
  assert.equal(result.comparisons, offers.length * hotels.length);
  assert.deepEqual({ offers, hotels }, before);
});

test('deterministically varied complete observations preserve exact ordered parity', () => {
  let seed = 728;
  const pick = values => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[seed % values.length];
  };
  const hotels = Array.from({ length: 240 }, (_, index) => hotel({
    hotelId: index % 30,
    starRating: pick([3, 4, 5, '4']),
    location: { neighborhoodID: pick(['area-a', 'area-b', 12, '12']) },
    overallGuestRating: pick([7, 7.4, 8, 8.4, 9, '8.4']),
    totalReviewCount: pick([0, 100, 1254, 1300, '1254']),
    ratesSummary: { programName: pick(['Retail', 'Express_Deal', 'EXPRESS_DEAL']), minPrice: pick([100, 150, '150']) },
    hotelFeatures: { highlightedAmenities: pick([[], ['POOL', 'WIFI'], ['WIFI', 'POOL']]) },
    amenitiesIcons: pick([[], hotel().amenitiesIcons, hotel().amenitiesIcons.toReversed()]),
  }));
  const offers = hotels.slice(0, 80).flatMap((row, index) => {
    const matching = offer({ ...row, pclnId: `offer-${index % 10}`,
      overallGuestRating: Math.floor(row.overallGuestRating),
      totalReviewCount: Math.floor(row.totalReviewCount / 100) * 100,
      ratesSummary: { minStrikePrice: row.ratesSummary.minPrice } });
    return [matching, { ...matching, totalReviewCount: Number(matching.totalReviewCount) + 101 }];
  });
  assert.equal(offers.every(isValidOffer), true);
  assert.equal(hotels.every(isValidHotel), true);
  const expected = matchOriginal(offers, hotels);
  assert.ok(expected.length > 0);
  assert.deepEqual(matchRefactored(offers, hotels).pairs, expected);
  assert.deepEqual(matchRefactored(offers.toReversed(), hotels.toReversed()).pairs,
    matchOriginal(offers.toReversed(), hotels.toReversed()));
});
