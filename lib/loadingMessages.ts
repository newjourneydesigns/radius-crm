export const LOADING_MESSAGES = [
  'You are known by your good Father.',
  'You are seen by God.',
  'You are valued by heaven.',
  'You are loved by God.',
  'You are righteous in Christ.',
  'You are a beloved child of God.',
  'You are favored by God.',
  'You are chosen in Jesus.',
  'You are empowered by the Holy Spirit.',
  'You are a hope carrier.',
  'You are holy in Christ.',
  'You are forgiven in Jesus.',
  'You are a new creation.',
  'You are accepted in Christ.',
  'You are created on purpose.',
  'You are made in the image of God.',
  'You are filled with the Holy Spirit.',
  'You are never alone.',
  'You are free in Jesus.',
  'You are secure in the Father\'s love.',
  'You are part of God\'s family.',
  'You are invited to receive His grace.',
  'You are created for godly relationships.',
  'You are sent to release His kingdom.',
  'You are a disciple of Jesus.',
  'You are becoming more like Christ.',
  'You are alive in Him.',
  'You are held by His grace.',
  'You are being transformed by His presence.',
  'You are more than your past.',
  'You are blessed to be a blessing.',
  'You are created to bring glory to God.',
  'You are part of a movement of hope.',
  'You are deeply loved, completely forgiven, fully alive, and never alone.',
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
