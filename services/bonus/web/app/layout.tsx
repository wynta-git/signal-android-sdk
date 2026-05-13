import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { ReduxProvider } from '@/store/provider'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from 'react-hot-toast'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bonus Admin — PAM',
  description: 'Bonus campaign management for PAM platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <ReduxProvider>
          <Sidebar />
          <main className="ml-56 min-h-screen">
            <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
          </main>
          <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        </ReduxProvider>
      </body>
    </html>
  )
}
