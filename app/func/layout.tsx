import { ReactNode } from 'react';

export default function FuncLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      {children}
    </div>
  );
}
