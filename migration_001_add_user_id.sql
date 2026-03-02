-- ==========================================
-- 1. Add user_id column to tables
-- ==========================================

-- for Cards
ALTER TABLE public.cards 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- for Benefit Rules
ALTER TABLE public.benefit_rules
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ==========================================
-- 2. Enable Row Level Security (RLS)
-- ==========================================

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_card_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_history ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. Create RLS Policies
-- ==========================================

-- ------------------------------------------
-- Cards: Everyone can read system cards (user_id is NULL)
--        Users can read/write their own cards
-- ------------------------------------------

-- Policy: Read System Cards
CREATE POLICY "Enable read access for all users to system cards"
ON public.cards FOR SELECT
USING (user_id IS NULL);

-- Policy: Read Own Cards
CREATE POLICY "Enable read access for users to their own cards"
ON public.cards FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Insert Own Cards
CREATE POLICY "Enable insert for users to their own cards"
ON public.cards FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Update Own Cards
CREATE POLICY "Enable update for users to their own cards"
ON public.cards FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Delete Own Cards
CREATE POLICY "Enable delete for users to their own cards"
ON public.cards FOR DELETE
USING (auth.uid() = user_id);

-- ------------------------------------------
-- Benefit Rules: Similar to Cards
-- ------------------------------------------

CREATE POLICY "Enable read access for all users to system rules"
ON public.benefit_rules FOR SELECT
USING (user_id IS NULL);

CREATE POLICY "Enable read access for users to their own rules"
ON public.benefit_rules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Enable insert for users to their own rules"
ON public.benefit_rules FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for users to their own rules"
ON public.benefit_rules FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Enable delete for users to their own rules"
ON public.benefit_rules FOR DELETE
USING (auth.uid() = user_id);

-- ------------------------------------------
-- Transaction History: Strictly Private
-- ------------------------------------------

CREATE POLICY "Enable all access for users to their own transaction history"
ON public.transaction_history FOR ALL
USING (auth.uid() = user_id);

-- ------------------------------------------
-- User Card Performances: Strictly Private
-- ------------------------------------------

CREATE POLICY "Enable all access for users to their own card performances"
ON public.user_card_performances FOR ALL
USING (auth.uid() = user_id);
