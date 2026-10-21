import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const HIS_NAME = import.meta.env.VITE_HIS_NAME || 'Him';
export const remote = Boolean(SB_URL && KEY);
export const supabase = remote ? createClient(SB_URL, KEY) : null;

const OUTBOX = 'bl.outbox';
const LOCAL = 'bl.messages'; // demo mode only
const LOCAL_REPLIES = 'bl.replies'; // demo mode only
const KEY_SLOT = 'bl.key';
export const REPLY_MINUTES = 69;
const REPLY_MS = REPLY_MINUTES * 60_000;

// Her device is paired once by opening a link that carries ?key=...; the key then lives only here.
export function pairFromUrl() {
  const params = new URLSearchParams(location.search);
  const k = params.get('key');
  if (!k) return;
  try { localStorage.setItem(KEY_SLOT, k); } catch { /* private mode */ }
  params.delete('key');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}
export const hasKey = () => Boolean(herKey());

// Her passcode. Remote: the server decides. Local demo: it is 69.
export async function tryKey(input) {
  const k = input.trim();
  if (!k) return false;
  if (remote) {
    const { error } = await supabase.rpc('her_replies', { k });
    if (error) {
      if (error.message === 'forbidden') return false;
      throw error;
    }
  } else if (k !== '69') return false;
  try { localStorage.setItem(KEY_SLOT, k); } catch { /* private mode */ }
  return true;
}

const herKey = () => { try { return localStorage.getItem(KEY_SLOT) || ''; } catch { return ''; } };

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
        // leave_message ignores a repeated id, so retrying after a dropped connection is safe.
        const { error } = await supabase.rpc('leave_message', {
          k: herKey(), p_id: msg.id, p_body: msg.body, p_mood: msg.mood, p_at: msg.created_at,
        });
        if (error) break;
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

// ---------- Him -> her: gone REPLY_MINUTES after she opens it ----------

const live = (r) => !r.opened_at || new Date(r.opened_at).getTime() + REPLY_MS > Date.now();

// His side
export async function sendReply(body) {
  const text = body.trim();
  if (!remote) {
    write(LOCAL_REPLIES, [...read(LOCAL_REPLIES), { id: crypto.randomUUID(), created_at: new Date().toISOString(), body: text, opened_at: null }]);
    return;
  }
  const { error } = await supabase.from('replies').insert({ body: text });
  if (error) throw error;
}

export async function listSentReplies() {
  if (!remote) {
    const rows = read(LOCAL_REPLIES).filter(live);
    write(LOCAL_REPLIES, rows);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase.from('replies').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function unsendReply(id) {
  if (!remote) { write(LOCAL_REPLIES, read(LOCAL_REPLIES).filter((r) => r.id !== id)); return; }
  const { error } = await supabase.from('replies').delete().eq('id', id);
  if (error) throw error;
}

// Her side. Bodies are never stored on her device: they are fetched while open and dropped on close.
export async function pendingReplies() {
  try {
    if (!remote) {
      const rows = read(LOCAL_REPLIES).filter(live);
      write(LOCAL_REPLIES, rows);
      return rows.map(({ id, created_at, opened_at }) => ({ id, created_at, opened_at }));
    }
    const { data, error } = await supabase.rpc('her_replies', { k: herKey() });
    if (error) return [];
    return data.map(({ id, created_at, opened_at }) => ({ id, created_at, opened_at }));
  } catch { return []; }
}

export async function openReplies(ids) {
  const out = [];
  for (const id of ids) {
    if (!remote) {
      const rows = read(LOCAL_REPLIES);
      const r = rows.find((x) => x.id === id);
      if (r && live(r)) {
        r.opened_at ||= new Date().toISOString();
        write(LOCAL_REPLIES, rows);
        out.push({ ...r });
      }
    } else {
      const { data, error } = await supabase.rpc('open_reply', { k: herKey(), p_id: id });
      if (error) throw error;
      if (data?.[0]) out.push(data[0]);
    }
  }
  return out.map((r) => ({ ...r, goneAt: new Date(new Date(r.opened_at).getTime() + REPLY_MS) }));
}
