import { Open_Sans } from 'next/font/google';

// Open Sans is the Circle Leader Toolkit's body font (see app/circle-leader-toolkit/
// layout.tsx). Admin editors render a WYSIWYG/preview of toolkit content on the dark
// RADIUS pages, so they need the same font for an accurate match. Applying
// `csOpenSans.variable` to a wrapper defines `--font-cs-body`, which the `.cs-canvas`
// styles consume just like the real toolkit does.
export const csOpenSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});
