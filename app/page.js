import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Board from './Board';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <Board />;
}
