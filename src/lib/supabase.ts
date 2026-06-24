import { createClient, type Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
)

export const getActiveSupabaseSession = async (timeoutMs = 5000): Promise<Session> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.access_token) return data.session;

  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error('Supabase Auth session is not ready.'));
    }, timeoutMs);

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) return;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
      resolve(session);
    });

    unsubscribe = () => listener.subscription.unsubscribe();
  });
};
