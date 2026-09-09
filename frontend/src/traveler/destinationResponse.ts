import type { Destination } from '../../../shared/contracts.ts';

export type DestinationSuggestion = Pick<Destination, 'id' | 'name' | 'label' | 'latitude' | 'longitude'> & Partial<Pick<Destination, 'regionName' | 'countryName'>>;

export function validDestinationResponse(body: unknown): body is { destinations: DestinationSuggestion[] } {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    && 'destinations' in body && Array.isArray(body.destinations) && body.destinations.every((destination: unknown) =>
      destination !== null && typeof destination === 'object' && !Array.isArray(destination)
      && 'id' in destination && 'name' in destination && 'label' in destination
      && 'latitude' in destination && 'longitude' in destination
      && typeof destination.id === 'string' && /^geonames:[1-9]\d{0,9}$/.test(destination.id)
      && typeof destination.name === 'string' && destination.name.trim().length > 0
      && typeof destination.label === 'string' && destination.label.trim().length > 0
      && (!('regionName' in destination) || destination.regionName === undefined || typeof destination.regionName === 'string')
      && (!('countryName' in destination) || destination.countryName === undefined || typeof destination.countryName === 'string')
      && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude));
}
