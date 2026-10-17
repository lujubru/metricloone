'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Post, SocialProfile } from '@/lib/types';

export default function Dashboard() {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    Promise.all([fetch('/api/profiles'), fetch('/api/posts')])
      .then(async ([profRes, postsRes]) => {
        if (ignore) return;
        if (profRes.ok) {
          const data = await profRes.json();
          setProfiles(data.profiles || []);
        }
        if (postsRes.ok) {
          const data = await postsRes.json();
          setPosts(data.posts || []);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('posts-updated', refresh);
    return () => window.removeEventListener('posts-updated', refresh);
  }, []);

  const scheduledCount = posts.filter((p) => p.status === 'SCHEDULED').length;
  const publishedCount = posts.filter((p) => p.status === 'PUBLISHED').length;

  const stats = [
    { label: 'Connected Accounts', value: profiles.length },
    { label: 'Total Posts', value: posts.length },
    { label: 'Scheduled Posts', value: scheduledCount },
    { label: 'Published Posts', value: publishedCount },
  ];

  return (
    <>
      <h1 className="page-title">Overview Analytics</h1>
      <p className="page-subtitle">Welcome back! Connect your accounts to see insights.</p>

      <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
        {stats.map((s) => (
          <div className="card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Growth Overview</h2>
          <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>No data available to display chart.</span>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Connected Accounts</h2>
          {profiles.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
              <p>No accounts connected yet. Go to Connections to start.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {profiles.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{p.platform}</span>
                  <span style={{ fontWeight: 500 }}>{p.username || p.profileId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
