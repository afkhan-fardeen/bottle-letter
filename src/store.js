import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const HIS_NAME = import.meta.env.VITE_HIS_NAME || 'Him';
export const remote = Boolean(SB_URL && KEY);
export const supabase = remote ? createClient(SB_URL, KEY) : null;

const OUTBOX = 'bl.outbox';
const LOCAL = 'bl.messages'; // demo mode only

const read = (k) => {
  try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---- Her side: queue first, sync quietly ----

export function send(body, mood) {
  const msg = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    body: body.trim(),
    mood: mood || null,
    starred: false,
  };
  write(OUTBOX, [...read(OUTBOX), msg]);
  flush();
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (const msg of read(OUTBOX)) {
      if (remote) {
        const { error } = await supabase.from('messages').insert(msg);
        // 23505 = already stored by an earlier attempt; safe to drop from the queue.
        if (error && error.code !== '23505') break;
      } else {
        write(LOCAL, [...read(LOCAL), msg]);
      }
      write(OUTBOX, read(OUTBOX).filter((m) => m.id !== msg.id));
    }
  } catch {
    // offline: keep the queue and try again later
  } finally {
    flushing = false;
  }
}

window.addEventListener('online', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flush();
});

// ---- His side ----

export async function getSession() {
  if (!remote) return { local: true };
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}/?him=1` },
  });
  if (error) throw error;
}

export async function signOut() {
  if (remote) await supabase.auth.signOut();
}

export async function list() {
  if (!remote) return read(LOCAL).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function setStar(id, starred) {
  if (!remote) {
    write(LOCAL, read(LOCAL).map((m) => (m.id === id ? { ...m, starred } : m)));
    return;
  }
  const { error } = await supabase.from('messages').update({ starred }).eq('id', id);
  if (error) throw error;
}

export function exportBackup(messages) {
  const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `letters-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
