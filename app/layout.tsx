import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Poker Game',
  description: 'A multiplayer poker game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-gray-800 text-white p-4">
          <div className="container mx-auto flex gap-4">
            <Link href="/" className="hover:text-gray-300">Home</Link>
            <Link href="/play" className="hover:text-gray-300">Play</Link>
            <Link href="/games" className="hover:text-gray-300">Game History</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
