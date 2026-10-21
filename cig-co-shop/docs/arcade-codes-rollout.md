# Arcade codes: database rollout

The reworked Arcade needs two SQL files in `supabase/migrations/`. Run them in
the Supabase dashboard (**SQL Editor → New query → paste → Run**) for project
**CIG-CO-PRODUCTION**, or with `supabase db push`.

## 1. Before merging: `202610210001_arcade_codes_schema.sql`

Additive only. It adds the `arcade_codes` table, two nullable
`arcade_prizes` columns (`discount_basis_points`, `code_valid_days`), the
`cigco_check_arcade_code` function, and allows the `perk` prize type. The live
Arcade keeps working exactly as before. It's safe to run any time, and running
it twice is harmless.

## 2. Right after the merge deploys: `202610210002_arcade_codes_activate.sql`

This switches the Arcade over:

- Turns off p5, p20, merch, gift, again1 and again2. The rows are kept for
  play history.
- p10 becomes the first-play-only prize: a unique 10% code that expires in
  7 days.
- Adds p15 (15% unique code, weight 1), early (Early Access perk, weight 10)
  and giveaway (Giveaway Entry perk, weight 9), so 15% comes up about 1 in 20
  later plays.
- Replaces `cigco_arcade_claim` so it generates and stores the unique code.
- Replaces `cigco_process_stripe_order` so a recorded paid order marks its
  Arcade code as used. Nothing else in that function changes.

Run it as soon as the new site is live. Between the deploy and this step,
Arcade players still get the old static CIG10/CIG20 codes, which checkout
already rejects.

## Check afterwards

```sql
select id, prize_type, active, weight, discount_basis_points, code_valid_days
from arcade_prizes order by id;
```

Expected active rows: early (10), giveaway (9), p10 (first play), p15 (1).

## Undo (if needed)

Restore the prize rows from the backup in `/workspace/supabase-backup/` (taken
2026-10-20), and re-run the `cigco_arcade_claim` and
`cigco_process_stripe_order` definitions from the two earlier migrations.
