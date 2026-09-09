import { readFileSync } from 'node:fs';
import { normalizeDestinationText as normalize } from '../../shared/destinationText.js';

export function validQuery(query) {
  if (typeof query !== 'string' || query.length > 100) return false;
  for (const character of query) {
    const code = character.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return false;
  }
  return true;
}

const catalog = JSON.parse(readFileSync(new URL('../../data/destinations.json', import.meta.url), 'utf8'));
const legacyIds = new Map(Object.entries(JSON.parse(
  readFileSync(new URL('../../data/destinations-legacy.json', import.meta.url), 'utf8'),
)));
const countries = new Map(Object.entries(catalog.countries));
const countryAliases = [...countries].flatMap(([code, [, aliases]]) => aliases.map(key => ({ code, key })))
  .sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key));
const countryIds = new Map(countryAliases.map(({ code, key }) => [key, code]));
const namesPerCountry = new Map();
for (const row of catalog.cities) {
  const key = `${row[2]}:${normalize(row[1])}`;
  namesPerCountry.set(key, (namesPerCountry.get(key) ?? 0) + 1);
}

// The import is sorted by population, normalized name, then ID. Keeping that order
// gives deterministic ties without sorting thousands of matches per keystroke.
const entries = catalog.cities.map(row => {
  const [id, name, countryCode, adminCode, latitude, longitude, timezone, , aliases] = row;
  const [countryName, countryNames] = countries.get(countryCode);
  const regionName = catalog.regions[`${countryCode}.${adminCode}`] ?? '';
  const nameKey = normalize(name);
  const label = [name, ...(namesPerCountry.get(`${countryCode}:${nameKey}`) > 1 && regionName
    ? [regionName] : []), countryName].join(', ');
  return {
    destination: Object.freeze({ id: `geonames:${id}`, name, label, countryCode, countryName,
      regionName, latitude, longitude, timezone }),
    nameKey,
    regionCode: normalize(adminCode),
    // Delimiters support exact aliases and token prefixes in one compact string;
    // individual alias arrays can be released after startup.
    names: `\n ${aliases.join('\n ')}\n`,
    contextWords: ` ${normalize(`${regionName} ${adminCode}`)} ${countryNames.join(' ')}`,
  };
});
catalog.cities = [];
namesPerCountry.clear();
const byId = new Map(entries.map(entry => [entry.destination.id, entry.destination]));
const byCountry = new Map();
const byPrefix = new Map();
for (const [index, entry] of entries.entries()) {
  const code = entry.destination.countryCode;
  if (!byCountry.has(code)) byCountry.set(code, []);
  byCountry.get(code).push(index);
  const prefixes = new Set(`${entry.names} ${entry.contextWords}`.split(/[ \n]+/)
    .filter(word => word.length >= 2).map(word => word.slice(0, 2)));
  for (const prefix of prefixes) {
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(index);
  }
}

function candidatesFor(cityKey, { country, region, partialCountries = new Set() } = {}) {
  let indices = country ? byCountry.get(country) ?? [] : null;
  // Every match contains each token prefix. The shortest list is enough;
  // the existing ranker still checks full tokens and decides their order.
  for (const token of cityKey.split(' ')) {
    if (token.length < 2) continue;
    const group = byPrefix.get(token.slice(0, 2)) ?? [];
    if (!indices || group.length < indices.length) indices = group;
  }
  if (indices && partialCountries.size) {
    const union = new Set(indices);
    for (const code of partialCountries) for (const index of byCountry.get(code) ?? []) union.add(index);
    indices = [...union].sort((a, b) => a - b);
  }
  const candidates = indices ? indices.map(index => entries[index]) : entries;
  return country || region ? candidates.filter(entry =>
    (!country || entry.destination.countryCode === country) && (!region || entry.regionCode === region)) : candidates;
}

export function getDestination(id) {
  if (typeof id !== 'string' || !/^geonames:[1-9]\d{0,9}$/u.test(id)) return null;
  return byId.get(id) ?? null;
}

export function resolveLegacyCity(cityName) {
  if (!validQuery(cityName)) return null;
  const id = legacyIds.get(normalize(cityName));
  return id ? getDestination(`geonames:${id}`) : null;
}

function rankDestinations(candidates, cityKey, count, partialCountries = new Set()) {
  const tokens = [...new Set(cityKey.split(' '))].map(token => ` ${token}`);
  const aliasPrefix = `\n ${cityKey}`;
  const aliasExact = `${aliasPrefix}\n`;
  const buckets = Array.from({ length: 7 }, () => []);
  for (const entry of candidates) {
    let nameMatch = true;
    let contextMatch = true;
    for (const token of tokens) {
      if (!entry.names.includes(token)) {
        nameMatch = false;
        if (!entry.contextWords.includes(token)) {
          contextMatch = false;
          break;
        }
      }
    }
    let score;
    if (!contextMatch) {
      if (!partialCountries.has(entry.destination.countryCode)) continue;
      score = 6;
    } else if (entry.nameKey === cityKey) score = 0;
    else if (entry.names.includes(aliasExact)) score = 1;
    else if (entry.nameKey.startsWith(cityKey)) score = 2;
    else if (entry.names.includes(aliasPrefix)) score = 3;
    else score = nameMatch ? 4 : 5;
    if (buckets[score].length < count) buckets[score].push(entry.destination);
  }
  return buckets.flat().slice(0, count);
}

export function searchDestinations(query, { limit = 8, beforeScan } = {}) {
  if (!validQuery(query)) return [];
  const key = normalize(query);
  if (key.length < 2) return [];
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 10)) : 8;
  const exactCountry = countryIds.get(key);
  if (exactCountry) return (byCountry.get(exactCountry) ?? []).slice(0, count).map(index => entries[index].destination);
  beforeScan?.();

  // A country suffix qualifies the city. Country-first queries use context tokens:
  // treating every country prefix as a filter breaks "Panama City, Florida".
  const qualifier = countryAliases.find(({ key: alias }) => key.endsWith(` ${alias}`));
  const cityKey = qualifier ? key.slice(0, -qualifier.key.length - 1) : key;
  const partialCountries = new Set(!qualifier && key.length >= 3
    ? countryAliases.filter(({ key: alias }) => alias.startsWith(key)).map(({ code }) => code) : []);
  const candidates = candidatesFor(cityKey, { country: qualifier?.code, partialCountries });
  const results = rankDestinations(candidates, cityKey, count, partialCountries);
  if (results.length || !qualifier || qualifier.key.length !== 2) return results;

  // CA and IL can also mean California and Illinois. Keep country matches first;
  // only an empty country search permits an exact administrative-code fallback.
  return rankDestinations(candidatesFor(cityKey, { region: qualifier.key }), cityKey, count);
}
