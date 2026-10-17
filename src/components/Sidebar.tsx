'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, Inbox, Settings, Share2, Link as LinkIcon } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Analytics', path: '/', icon: <BarChart3 size={20} /> },
    { name: 'Planning', path: '/planning', icon: <CalendarDays size={20} /> },
    { name: 'Inbox', path: '/inbox', icon: <Inbox size={20} /> },
    { name: 'SmartLink', path: '/smartlink', icon: <LinkIcon size={20} /> },
    { name: 'Connections', path: '/connections', icon: <Share2 size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>M</div>
        <span>MetricClone</span>
      </div>
      <nav className="nav-menu">
        {navItems.map((item) => (
          <Link 
            href={item.path} 
            key={item.name}
            className={`nav-item ${pathname === item.path ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
