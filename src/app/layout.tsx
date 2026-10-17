import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { Providers } from './Providers';

export const metadata: Metadata = {
  title: 'Metricool Clone | Analytics & Planning',
  description: 'Manage your social media from one place',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <div className="app-container">
            <Sidebar />
            <div className="main-content">
              <Topbar />
              <div className="page-content">
                {children}
              </div>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
