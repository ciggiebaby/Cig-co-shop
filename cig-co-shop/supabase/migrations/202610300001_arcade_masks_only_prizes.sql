-- Arcade prizes: masks only (CIG decision, Thu Oct 29, 2026).
-- Run AFTER the site with masks-only promos (promo.js) is deployed, which is
-- after the Fri Oct 30 noon drop and only on CIG's OK.
--
-- Copy only: discount codes are already limited to masks by the checkout
-- (netlify/lib/stripe-pricing.js); this makes the prize text say so.
-- Free-item prizes (giveaway, and the retired Free Merch / Mystery Gift rows
-- if they're ever switched back on) are redeemable for one mask only, and the
-- free mask ships separately, so the winner pays $8.95 mask shipping for it.
-- No prize is switched on or off here, and weights are unchanged.
begin;

update public.arcade_prizes set
  detail = 'A one-time 10% off code for masks (ski mask, balaclava, moto mask), good for 7 days.'
where id = 'p10';

update public.arcade_prizes set
  detail = 'A one-time 15% off code for masks (ski mask, balaclava, moto mask), good for 7 days.'
where id = 'p15';

update public.arcade_prizes set
  detail = 'You''re entered in this month''s giveaway for one free mask (ski mask, balaclava or moto mask). The winner is emailed and pays $8.95 shipping for the mask.'
where id = 'giveaway';

update public.arcade_prizes set
  label = 'Free Mask',
  detail = 'Screenshot this and email or DM us to claim one free mask (ski mask, balaclava or moto mask). It ships separately for $8.95.'
where id = 'merch';

update public.arcade_prizes set
  label = 'Mystery Mask',
  detail = 'Screenshot this and email or DM us to claim a mystery mask (ski mask, balaclava or moto mask). It ships separately for $8.95.'
where id = 'gift';

commit;
