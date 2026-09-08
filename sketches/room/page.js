/* global document, window */
const byId = id => document.getElementById(id);
const datesDialog = byId('dates-dialog');
const datesForm = byId('dates-form');
const checkIn = byId('check-in');
const checkOut = byId('check-out');
const destination = byId('destination');
const dateText = byId('dates-text');
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (value, count) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localDate(date);
};
const today = localDate(new Date());
const horizon = addDays(today, 365);
const displayDate = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
const fullDate = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
let selectedDates = null;
let continueSearch = false;

checkIn.min = today;
checkIn.max = addDays(today, 364);

function updateCheckoutBounds() {
  const start = checkIn.value || today;
  checkOut.min = addDays(start, 1);
  checkOut.max = [addDays(start, 30), horizon].sort()[0];
  if (checkOut.value && (checkOut.value < checkOut.min || checkOut.value > checkOut.max)) checkOut.value = '';
}

function openDates() {
  // The inputs are a draft; cancelling never changes the committed trip dates.
  checkIn.value = selectedDates?.checkIn || addDays(today, 14);
  checkOut.value = selectedDates?.checkOut || addDays(today, 17);
  updateCheckoutBounds();
  datesDialog.showModal();
}

function focusSearch(event) {
  event.preventDefault();
  byId('search').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  destination.focus({ preventScroll: true });
}

function showComparison() {
  const itinerary = byId('comparison-trip');
  const adults = byId('travelers').selectedOptions[0].textContent;
  itinerary.textContent = `Your trip preview: ${destination.value.trim()} · ${fullDate(selectedDates.checkIn)}–${fullDate(selectedDates.checkOut)} · ${adults}, 1 room. The comparison below is illustrative; no live search was sent.`;
  itinerary.hidden = false;
  const heading = byId('comparison-title');
  byId('comparison').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

checkIn.addEventListener('change', updateCheckoutBounds);
byId('dates-trigger').addEventListener('click', () => {
  continueSearch = false;
  openDates();
});
datesForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!datesForm.reportValidity() || checkOut.value <= checkIn.value) return;
  selectedDates = { checkIn: checkIn.value, checkOut: checkOut.value };
  dateText.textContent = `${displayDate(selectedDates.checkIn)} — ${displayDate(selectedDates.checkOut)}`;
  byId('dates-trigger').setAttribute('aria-label', `Dates: ${fullDate(selectedDates.checkIn)} to ${fullDate(selectedDates.checkOut)}`);
  // aria-label takes the place of the original placeholder label association.
  byId('dates-trigger').removeAttribute('aria-labelledby');
  const shouldContinue = continueSearch;
  continueSearch = false;
  datesDialog.close();
  if (shouldContinue) showComparison();
});
datesDialog.addEventListener('close', () => { continueSearch = false; });

destination.addEventListener('input', () => destination.setCustomValidity(''));
byId('trip-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!destination.value.trim()) {
    destination.setCustomValidity('Enter a city to preview a comparison.');
    destination.reportValidity();
    return;
  }
  if (!selectedDates) {
    continueSearch = true;
    openDates();
    return;
  }
  showComparison();
});

document.querySelectorAll('[data-focus-search]').forEach(link => link.addEventListener('click', focusSearch));
document.querySelectorAll('[data-credits]').forEach(button => button.addEventListener('click', () => byId('credits-dialog').showModal()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
