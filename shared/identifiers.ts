// Live Express offers use opaque identifiers longer than named hotel IDs.
export const MAX_OFFER_ID_LENGTH = 1024;

export function validIdentifier(value: unknown, maximum = 200): value is string {
  return typeof value === 'string' && value.length <= maximum &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value);
}
