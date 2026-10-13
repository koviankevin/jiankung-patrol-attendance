// Reject remote targets and redirects before sending credentials or test data.
export function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API tests require a plain HTTP loopback origin');
  }
  return url.origin;
}

export const base = localOrigin(process.env.TEST_URL || 'http://127.0.0.1:5173');
export function localFetch(input, options = {}) {
  const url = new URL(input);
  if (url.origin !== base) throw new Error('API request escaped the local test origin');
  return fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(15_000)});
}
