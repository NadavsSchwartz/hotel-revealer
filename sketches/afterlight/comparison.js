/* global document */
const comparisonStudy = document.getElementById('comparison');

if (comparisonStudy) {
  const explanations = {
    area: ['Reading the area', "Both possible hotels are in the offer's Downtown area. That narrows the field, but doesn't distinguish one from the other."],
    stars: ['Reading the star rating', 'All three list four stars. The category aligns, but a shared star rating cannot identify an unnamed hotel.'],
    rating: ['Reading the guest rating', "The offer says 8.5 or higher. Both 9.1 and 9.0 meet that threshold; neither rating confirms the hotel's identity."],
    reviews: ['Reading the review count', "The Paloma's 648 reviews meet the 300+ threshold. The Atlas has no available count in this example, so that clue remains unresolved."],
    amenities: ['Reading the amenities', 'The Paloma lists both a pool and Wi-Fi. The Atlas lists Wi-Fi, but its pool is not verified. Missing information is an unknown, not evidence that a pool is absent.'],
  };
  const explanationLabel = document.getElementById('comparison-explanation-label');
  const explanationCopy = document.getElementById('comparison-explanation-copy');
  const criteria = Object.keys(explanations);

  for (const criterion of criteria) {
    const button = document.getElementById(`comparison-criterion-${criterion}`);
    button?.addEventListener('click', () => {
      for (const key of criteria) {
        const selected = key === criterion;
        document.getElementById(`comparison-criterion-${key}`)?.setAttribute('aria-pressed', String(selected));
        document.getElementById(`comparison-row-${key}`)?.classList.toggle('comparison-active-row', selected);
      }
      if (explanationLabel && explanationCopy) {
        const [label, copy] = explanations[criterion];
        explanationLabel.textContent = label;
        explanationCopy.textContent = copy;
      }
    });
  }
}
