'use client';
import { useState } from 'react';
import { Bell, Search, User } from 'lucide-react';
import NewPostModal from '@/components/NewPostModal';

export default function Topbar() {
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder="Search..." 
            style={{ 
              width: '100%', 
              padding: '0.5rem 1rem 0.5rem 2.5rem', 
              borderRadius: '2rem', 
              border: '1px solid var(--border-color)', 
              backgroundColor: 'var(--sidebar-bg)',
              color: 'var(--text-primary)',
              outline: 'none'
            }} 
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button className="btn btn-primary" style={{ borderRadius: '2rem' }} onClick={() => setIsNewPostOpen(true)}>
          + New Post
        </button>
        <Bell size={20} style={{ color: 'var(--text-secondary)', cursor: 'pointer' }} />
        <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--card-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <User size={20} />
        </div>
      </div>

      <NewPostModal
        open={isNewPostOpen}
        onClose={() => setIsNewPostOpen(false)}
        onCreated={() => window.dispatchEvent(new Event('posts-updated'))}
      />
    </header>
  );
}
