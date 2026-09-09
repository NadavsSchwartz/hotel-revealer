import 'dotenv/config';
import { resetProviderState } from '../backend/provider/state.js';

if (!process.argv.includes('--after-review')) {
  console.error('Stop the app and review the provider block or interrupted request first. Then use npm run provider:reset -- --after-review and restart the application.');
  process.exitCode = 1;
} else {
  await resetProviderState({});
  console.log('Provider control state reset. Restart the app. This does not configure or authorize live access.');
}
