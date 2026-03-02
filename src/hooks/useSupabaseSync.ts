import { useEffect, useRef } from 'react';
import { supabase } from '@/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { TransactionHistory } from '@/types';
import { TEST_USER_ID } from '@/constants/auth';
import { useAuth } from './useAuth';

export function useSupabaseSync() {
    const { setInitialData, addTransaction, setLoading } = useAppStore();
    const { user, loading: authLoading } = useAuth();
    const isInitialized = useRef(false);

    useEffect(() => {
        if (authLoading) return; // Wait for auth check
        if (!user && !isInitialized.current) {
            // OPTIONAL: If no user, maybe just fetch public system data?
            // For now, let's allow it but warn or handle graceful degradation
            console.log('No user logged in, fetching system data only');
        }

        // Allow re-sync when user changes? 
        // For now, simple implementation: run once when auth is ready
        // But if user logs in/out, we might want to reset.
        // Let's rely on manual page refresh or route change for now to be safe,
        // or add user.id to dependency array.

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch all tables in parallel
                // RLS will handle filtering for 'cards' and 'rules' (system + own)
                // History and Performance are strictly own (handled by RLS)
                const [
                    catRes, brandRes, cardRes, ruleRes, perfRes, histRes
                ] = await Promise.all([
                    supabase.from('categories').select('*'),
                    supabase.from('brands').select('*'),
                    supabase.from('cards').select('*'),
                    supabase.from('benefit_rules').select('*'),
                    supabase.from('user_card_performances').select('*'),
                    supabase.from('transaction_history').select('*').order('created_at', { ascending: false })
                ]);

                if (catRes.error) console.error('Categories error:', JSON.stringify(catRes.error, null, 2));
                if (brandRes.error) console.error('Brands error:', JSON.stringify(brandRes.error, null, 2));
                if (cardRes.error) console.error('Cards error:', JSON.stringify(cardRes.error, null, 2));
                if (ruleRes.error) console.error('Rules error:', JSON.stringify(ruleRes.error, null, 2));
                if (perfRes.error) console.error('Performances error:', JSON.stringify(perfRes.error, null, 2));
                if (histRes.error) console.error('History error:', JSON.stringify(histRes.error, null, 2));

                // Transform incoming data to match TS types (snake_case -> camelCase mapping if needed)
                // For now assuming the types match exactly or we handle naming conventions.
                // NOTE: Supabase returns snake_case columns. We need to map them to camelCase types.

                const mapKeys = (obj: any): any => {
                    if (Array.isArray(obj)) return obj.map(mapKeys);
                    if (obj && typeof obj === 'object') {
                        const newObj: any = {};
                        for (const key in obj) {
                            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                            newObj[camelKey] = mapKeys(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };

                setInitialData({
                    categories: mapKeys(catRes.data || []),
                    brands: mapKeys(brandRes.data || []),
                    cards: mapKeys(cardRes.data || []),
                    rules: mapKeys(ruleRes.data || []),
                    performances: mapKeys(perfRes.data || []),
                    history: mapKeys(histRes.data || []).map((item: any) => ({
                        ...item,
                        date: item.createdAt || item.date
                    })),
                });
            } catch (error) {
                console.error('Failed to sync with Supabase:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [setInitialData, setLoading, user, authLoading]);

    // Public method to save transaction
    const saveTransaction = async (tx: Omit<TransactionHistory, 'id' | 'date'>) => {
        // 1. Optimistic Update
        const optimisticId = Date.now(); // Temp ID
        const newTx: TransactionHistory = {
            ...tx,
            id: optimisticId,
            date: new Date().toISOString()
        };
        addTransaction(newTx);

        // 2. Sync to DB
        // Convert camelCase keys back to snake_case for DB
        const userId = user?.id || TEST_USER_ID;

        if (userId === TEST_USER_ID && !user) {
            console.warn('Using Test User ID for transaction save (No authenticated user).');
        }

        const dbPayload = {
            user_id: userId,
            card_id: tx.cardId,
            brand_id: tx.brandId,
            rule_id: tx.ruleId,
            amount: tx.amount,
            discount_amount: tx.discountAmount
        };

        console.log('Attempting to save transaction with payload:', dbPayload);

        const { data, error } = await supabase
            .from('transaction_history')
            .insert(dbPayload)
            .select()
            .single();

        if (error) {
            console.error('Failed to save transaction. Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            console.error('Full error object:', error);
            // TODO: Rollback optimistic update
        } else {
            console.log('Transaction saved successfully:', data);
            // Optional: Replace temp ID with real ID in store?
            // heavily dependent on whether we refresh or simple append
        }
    };

    return { saveTransaction };
}
