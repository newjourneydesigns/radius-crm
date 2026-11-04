import { supabase } from './supabase';

/**
 * Records a "Connect New Person" referral on the leader's profile and opens
 * Messages to the leader with the message pre-filled. Shared by the circle
 * profile page and the Circles list so both paths save the same note.
 * Returns whether Messages was opened (the leader had a phone).
 */
export async function sendConnectReferral({
  leaderId,
  leaderPhone,
  userId,
  message,
}: {
  leaderId: number;
  leaderPhone?: string | null;
  userId: string;
  message: string;
}): Promise<boolean> {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const { error } = await supabase
    .from('notes')
    .insert({
      circle_leader_id: leaderId,
      content: `[Connect Person Referral - ${today}]\n\n${message}`,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) throw error;

  if (leaderPhone) {
    const cleanPhone = leaderPhone.replace(/\D/g, '');
    window.location.href = `sms:${cleanPhone}&body=${encodeURIComponent(message)}`;
    return true;
  }
  return false;
}
