'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

type TourText = {
  id: string;
  action_name: string;
  title: string;
  text: string;
  scene_id: string;
  updated_at: string;
};

export default function Dashboard({ email }: { email: string }) {
  const supabase = createClient();
  const [tourTexts, setTourTexts] = useState<TourText[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<TourText | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadTourTexts() {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('tour_texts')
      .select('id, action_name, title, text, scene_id, updated_at')
      .order('title');
    if (fetchError) setError(fetchError.message);
    else setTourTexts((data ?? []) as TourText[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadTourTexts();
    const channel = supabase
      .channel('tour-texts-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_texts' }, () => void loadTourTexts())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const normalizedQuery = query.toLowerCase();
  const filtered = tourTexts.filter(item => `${item.title} ${item.action_name}`.toLowerCase().includes(normalizedQuery));

  function openEdit(item: TourText) {
    setSelected(item);
    setTitle(item.title);
    setText(item.text);
  }

  function closeModal() {
    if (!saving) setSelected(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from('tour_texts').update({ title: title.trim(), text }).eq('id', selected.id);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    setSelected(null);
    setSaving(false);
    setToast('Tour text updated.');
    await loadTourTexts();
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">ML</span><span>Museo de Legazpi</span></div><div><small>{email}</small> <button className="link-button" onClick={signOut}>Sign out</button></div></header>
    <div className="page">
      <div className="intro"><div><p className="eyebrow">Content desk / live</p><h1>Tour text</h1></div><p>Edit the words visitors read in the museum tour. Action names and hotspot titles identify each entry.</p></div>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="toolbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search tour text titles and actions" placeholder="Search titles or actions" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <div className="table-wrap">{loading ? <div className="loading" role="status">Loading tour text...</div> : filtered.length === 0 ? <div className="empty">{query ? 'No titles or actions match your search.' : 'No tour text records found.'}</div> : <table><caption className="sr-only">Tour text records</caption><thead><tr><th>Hotspot title</th><th>Action</th><th>Scene</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td className="title">{item.title}</td><td><span>{item.action_name}</span></td><td>{item.scene_id}</td><td className="meta">{new Date(item.updated_at).toLocaleDateString()}</td><td><button className="link-button" onClick={() => openEdit(item)}>Edit text</button></td></tr>)}</tbody></table>}</div>
    </div>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><h2 id="modal-title">Edit tour text</h2><button className="close" aria-label="Close dialog" onClick={closeModal}>×</button></div><form onSubmit={save}><div className="detail"><label>Action</label><p>{selected.action_name}</p><label>Scene</label><p>{selected.scene_id}</p></div><div className="field"><label htmlFor="tour-title">Hotspot title</label><input id="tour-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required /></div><div className="field"><label htmlFor="tour-text">Visitor-facing paragraph</label><textarea id="tour-text" value={text} onChange={event => setText(event.target.value)} maxLength={30000} required /></div><div className="modal-footer"><button type="button" className="button secondary" onClick={closeModal}>Cancel</button><button className="button" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div></form></section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
