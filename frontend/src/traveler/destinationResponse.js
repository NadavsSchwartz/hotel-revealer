export function validDestinationResponse(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    && Array.isArray(body.destinations) && body.destinations.every(destination =>
      destination !== null && typeof destination === 'object' && !Array.isArray(destination)
      && typeof destination.id === 'string' && /^geonames:[1-9]\d{0,9}$/.test(destination.id)
      && typeof destination.name === 'string' && destination.name.trim().length > 0
      && typeof destination.label === 'string' && destination.label.trim().length > 0
      && (destination.regionName === undefined || typeof destination.regionName === 'string')
      && (destination.countryName === undefined || typeof destination.countryName === 'string')
      && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude));
}
