import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nwrcbcoqcsactnskdotc.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fJRse4JPny8TchCb-MVCeg_DYMnnn7z'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
