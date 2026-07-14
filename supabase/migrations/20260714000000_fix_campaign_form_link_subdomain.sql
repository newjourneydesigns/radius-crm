-- Fix campaign form links that were baked with CCB's short login alias
-- (`valleycreek.ccbchurch.com`) instead of the church's public form host
-- (`valleycreekchurch.ccbchurch.com`). form_link is derived from ccb_form_id
-- and stored at create/edit time, so existing rows keep the stale host until
-- corrected here. The match anchors on `valleycreek.ccbchurch.com` (dot after
-- `valleycreek`) so already-correct `valleycreekchurch.ccbchurch.com` rows are
-- untouched.
UPDATE follow_up_campaigns
SET form_link = REPLACE(form_link, 'valleycreek.ccbchurch.com', 'valleycreekchurch.ccbchurch.com')
WHERE form_link LIKE '%valleycreek.ccbchurch.com%';
