'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MARKUP } from './board-markup';
import { initBoard } from './board-app';

// La bacheca è il codice del prototipo, montato qui e collegato a Supabase.
export default function Board() {
  const ref = useRef(null);

  useEffect(() => {
    ref.current.innerHTML = MARKUP.replace('{{VERSION}}', process.env.APP_VERSION);
    return initBoard(createClient());
  }, []);

  return <div ref={ref} suppressHydrationWarning />;
}
