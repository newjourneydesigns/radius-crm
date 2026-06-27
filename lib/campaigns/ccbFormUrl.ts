// Build the CCB form-response URL from a form ID. CCB form links always follow
// the same shape, so admins only provide the Form ID and we derive the link used
// for {{form_link}} in message templates and the "Open form" button.
//
// Server-side only — reads CCB_SUBDOMAIN.
export function ccbFormUrl(formId: string | number | null | undefined): string {
  const id = String(formId ?? '').trim();
  if (!id) return '';
  const subdomain = process.env.CCB_SUBDOMAIN || 'valleycreekchurch';
  return `https://${subdomain}.ccbchurch.com/goto/forms/${id}/responses/new`;
}
