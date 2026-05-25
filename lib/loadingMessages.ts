export const LOADING_MESSAGES = [
  'We are Jesus-focused, Spirit-filled, Life-giving',
  'We are quick to repent',
  'We pursue unity with everything we have',
  'We are a family on mission',
  'We do everything with all our heart',
  'We are passionate about the presence of God',
  'We love God\'s Word',
  'We embrace the process',
  'We have a responsibility to give what we have received',
  'We believe there\'s always more',
  'We are disciples first',
  'We are responsible for our own journey',
  'We tend our garden with passion, excellence and creativity',
  'We are committed to becoming people of love',
  'Our life is our message',
];

const LAST_LOADING_MESSAGE_INDEX_KEY = 'radius-last-loading-message-index';

export function getRandomLoadingMessage(): string {
  if (typeof window === 'undefined') {
    return LOADING_MESSAGES[0];
  }

  try {
    const previousIndex = Number.parseInt(
      window.localStorage.getItem(LAST_LOADING_MESSAGE_INDEX_KEY) ?? '-1',
      10
    );
    let nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);

    if (
      LOADING_MESSAGES.length > 1 &&
      Number.isFinite(previousIndex) &&
      nextIndex === previousIndex
    ) {
      nextIndex = (nextIndex + 1) % LOADING_MESSAGES.length;
    }

    window.localStorage.setItem(LAST_LOADING_MESSAGE_INDEX_KEY, String(nextIndex));
    return LOADING_MESSAGES[nextIndex];
  } catch {
    return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
  }
}
