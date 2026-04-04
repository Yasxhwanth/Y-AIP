import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ApolloProvider } from '@/components/apollo-provider'
import { AuthProvider } from '@/components/auth-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Y-AIP Command Center',
  description: 'Autonomous Intelligence Platform - Command Center',
}

import { GlobalSidebar } from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0d1117] text-neutral-200 antialiased min-h-screen flex overflow-hidden`}>
        <AuthProvider>
          <ApolloProvider>
            <GlobalSidebar />
            <main className="flex-1 h-screen overflow-y-auto bg-[#0a0f1a] relative">
              {children}
            </main>
          </ApolloProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
