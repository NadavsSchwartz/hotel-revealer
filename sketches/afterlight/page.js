/* global document, window */
const dateIn = document.querySelector('#check-in');
const dateOut = document.querySelector('#check-out');
const destination = document.querySelector('#destination');
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
};
const today = localDate(new Date());
dateIn.min = today;
dateIn.max = addDays(today, 364);
dateIn.value = addDays(today, 14);
dateOut.value = addDays(today, 17);

function updateDeparture() {
  dateOut.setCustomValidity('');
  if (!dateIn.value || !dateIn.validity.valid) return;
  dateOut.min = addDays(dateIn.value, 1);
  dateOut.max = [addDays(dateIn.value, 30), addDays(today, 365)].sort()[0];
  if (dateOut.value <= dateIn.value || dateOut.value > dateOut.max) dateOut.value = dateOut.min;
}
updateDeparture();
dateIn.addEventListener('change', updateDeparture);
dateOut.addEventListener('input', () => dateOut.setCustomValidity(''));
destination.addEventListener('input', () => destination.setCustomValidity(''));

document.querySelector('#trip-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!destination.value.trim()) {
    destination.setCustomValidity('Enter a city to explore the sketch.');
    destination.reportValidity();
    return;
  }
  if (dateOut.value <= dateIn.value) {
    dateOut.setCustomValidity('Choose a check-out date after check-in.');
    dateOut.reportValidity();
    return;
  }
  document.querySelector('#search-status').textContent = `A closer look at ${destination.value.trim()}. This sketch uses the illustrative comparison below; no live search was sent.`;
  const comparison = document.querySelector('#comparison');
  const heading = document.querySelector('#comparison-title');
  comparison.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
});

const credits = document.querySelector('#credits-dialog');
document.querySelectorAll('[data-open-credits]').forEach(button => button.addEventListener('click', () => credits.showModal()));
document.querySelector('.dialog-close').addEventListener('click', () => credits.close());
credits.addEventListener('click', event => {
  if (event.target !== credits) return;
  const box = credits.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) credits.close();
});
