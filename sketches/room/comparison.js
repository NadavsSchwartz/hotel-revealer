/* global document */
(() => {
  const section = document.querySelector('.room-comparison');
  if (!section) return;

  const candidates = {
    paloma: {
      name: 'The Paloma',
      rating: '9.1 / 10',
      reviews: '648',
      reviewsNote: 'Meets the minimum',
      amenities: 'Pool · Wi-Fi',
      amenitiesNote: 'Both amenities listed',
      partial: false,
      status: 'Supporting details',
      explanation: 'The Paloma meets the offer’s listed criteria in this example. Those details support a possibility; they do not establish the hotel’s identity.',
    },
    atlas: {
      name: 'The Atlas',
      rating: '9.0 / 10',
      reviews: 'Unknown',
      reviewsNote: 'Review count unavailable',
      amenities: 'Wi-Fi',
      amenitiesNote: 'Pool information unavailable',
      partial: true,
      status: 'Partial information',
      explanation: 'The Atlas shares the area and star rating, and meets the guest-rating minimum. Its review count and pool information are unavailable, so those criteria cannot be checked. Its identity remains unverified.',
    },
  };

  const write = (id, value) => {
    const element = section.querySelector(`#${id}`);
    if (element) element.textContent = value;
  };

  section.querySelectorAll('[data-comparison-candidate]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      const candidate = candidates[button.dataset.comparisonCandidate];
      if (!candidate) return;

      section.querySelectorAll('[data-comparison-candidate]').forEach(option => {
        option.setAttribute('aria-pressed', String(option === button));
      });

      write('comparison-candidate-name', candidate.name);
      write('comparison-rating-value', candidate.rating);
      write('comparison-reviews-value', candidate.reviews);
      write('comparison-reviews-note', candidate.reviewsNote);
      write('comparison-amenities-value', candidate.amenities);
      write('comparison-amenities-note', candidate.amenitiesNote);
      ['comparison-reviews-cell', 'comparison-amenities-cell'].forEach(id => {
        section.querySelector(`#${id}`)?.classList.toggle('comparison-missing', candidate.partial);
      });
      write('comparison-status', candidate.status);
      write('comparison-explanation-copy', candidate.explanation);
    });
  });
})();
