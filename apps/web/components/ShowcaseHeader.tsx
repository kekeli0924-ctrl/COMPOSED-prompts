import Link from 'next/link';

export function ShowcaseHeader() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Pomfret Study Prompts
        </Link>
        <nav className="flex items-center gap-5 text-sm text-slate-600">
          <Link href="/wizard" className="hover:text-slate-900">Wizard</Link>
          <Link href="/history" className="hover:text-slate-900">History</Link>
          <Link href="/about" className="hover:text-slate-900">How it works</Link>
        </nav>
      </div>
    </header>
  );
}
