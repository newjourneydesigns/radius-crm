import NextErrorComponent, { type ErrorProps } from 'next/error';

export default function ErrorPage(props: ErrorProps) {
  return <NextErrorComponent {...props} />;
}
