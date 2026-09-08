export function normalizeDestinationText(value) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/['’‘ʼ`.]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
