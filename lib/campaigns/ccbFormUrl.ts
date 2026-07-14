// Build the CCB form-response URL from a form ID. CCB form links always follow
// the same shape, so admins only provide the Form ID and we derive the link used
// for {{form_link}} in message templates and the "Open form" button.
//
// Server-side only — reads CCB_SUBDOMAIN.
export function ccbFormUrl(formId: string | number | null | undefined): string {
  const id = String(formId ?? '').trim();
  if (!id) return '';
  let subdomain = (process.env.CCB_SUBDOMAIN || 'valleycreekchurch').trim();
  // CCB's short login alias `valleycreek` doesn't serve /goto/forms links — the
  // church's public form host is the full `valleycreekchurch` subdomain. Normalize
  // so a stale/short CCB_SUBDOMAIN can't produce a broken form link.
  if (subdomain === 'valleycreek') subdomain = 'valleycreekchurch';
  return `https://${subdomain}.ccbchurch.com/goto/forms/${id}/responses/new`;
}
