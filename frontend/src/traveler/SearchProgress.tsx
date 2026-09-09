import { BrandIcon } from './Brand.tsx';
import './progress.css';

export default function SearchProgress({ variant = 'search' }: { variant?: 'search' | 'refresh' | 'preparing' }) {
  const compact = variant === 'refresh';
  const preparing = variant === 'preparing';
  const Container = compact ? 'div' : 'section';
  const Heading = compact ? 'strong' : 'h2';
  const title = preparing ? 'Preparing your search' : compact ? 'Updating hotel deals' : 'Searching hotel deals';
  return (
    <Container className={compact ? 'results-updating' : 'search-progress'} aria-busy="true"
      aria-label={compact ? undefined : preparing ? 'Search preparation' : 'Hotel search progress'}>
      <BrandIcon className={`search-mark${compact ? ' search-mark-compact' : ''}`} />
      <div>
        <Heading>{title}</Heading>
        <p>{compact ? 'Your current results remain available.' : preparing ? 'Getting your search ready.' : 'We’ll show the results as soon as they’re ready.'}</p>
      </div>
    </Container>
  );
}
