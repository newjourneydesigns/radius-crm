'use client';

import styles from './SubmittingAnimation.module.css';

export default function SubmittingAnimation() {
  return (
    <div className={styles.container}>
      <div className={styles.pulse} />
      <div className={styles.pulse} style={{ animationDelay: '0.2s' }} />
      <div className={styles.pulse} style={{ animationDelay: '0.4s' }} />
    </div>
  );
}
