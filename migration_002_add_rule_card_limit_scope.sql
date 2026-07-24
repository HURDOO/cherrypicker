ALTER TABLE public.benefit_rules
ADD COLUMN IF NOT EXISTS uses_card_limit BOOLEAN DEFAULT TRUE;
