export function normalizeDestinationText(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/['’‘ʼ`.]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
