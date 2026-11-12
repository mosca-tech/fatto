'use client';

import { createClient } from '@/lib/supabase/client';

export default function LoginButton() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }
  return (
    <button className="btn primary" type="button" onClick={signIn}>
      Accedi con Google
    </button>
  );
}
