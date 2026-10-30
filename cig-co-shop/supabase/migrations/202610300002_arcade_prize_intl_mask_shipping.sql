-- Arcade free-mask prizes: winners outside the US pay the international mask
-- rate, not $8.95 (CIG, Fri Oct 30, 2026: masks ship to CA, GB, DE, AU, JP, KR).
-- Copy only. Rates live in shipping-rates.js (IN_HAND_INTL_SHIPPING_USD) and
-- promo.js (giftMaskShippingCents). No prize is switched on or off here.
begin;

update public.arcade_prizes set
  detail = 'You''re entered in this month''s giveaway for one free mask (ski mask, balaclava or moto mask). The winner is emailed and pays $8.95 shipping for the mask in the US, or our international mask rate abroad (from $25).'
where id = 'giveaway';

update public.arcade_prizes set
  detail = 'Screenshot this and email or DM us to claim one free mask (ski mask, balaclava or moto mask). It ships separately for $8.95 in the US, or our international mask rate abroad (from $25).'
where id = 'merch';

update public.arcade_prizes set
  detail = 'Screenshot this and email or DM us to claim a mystery mask (ski mask, balaclava or moto mask). It ships separately for $8.95 in the US, or our international mask rate abroad (from $25).'
where id = 'gift';

commit;
