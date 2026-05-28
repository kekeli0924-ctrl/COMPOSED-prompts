import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">
        Better study prompts for Pomfret students.
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Tell us your course, the assessment, and how you study best. Get back a
        prompt that&apos;s tuned to your LLM and your situation — the kind of
        prompt that gets a real study session, not a generic summary.
      </p>
      <div className="mt-10 flex gap-3">
        <Link href="/wizard">
          <Button size="lg">Start studying</Button>
        </Link>
        <Link href="/history">
          <Button size="lg" variant="outline">
            My past prompts
          </Button>
        </Link>
        <Link href="/about">
          <Button size="lg" variant="ghost">
            How it works
          </Button>
        </Link>
      </div>
      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        <FeatureCard
          title="Tuned to your model"
          body="The prompt is formatted for Claude, GPT, or Gemini — whichever you actually use."
        />
        <FeatureCard
          title="Knows your course"
          body="Pulls from the Pomfret curriculum so the LLM understands what you're studying."
        />
        <FeatureCard
          title="No accounts"
          body="Use it freely. Your past prompts live in your browser, not on a server."
        />
      </section>

      <BehindTheScenes title="What you're looking at">
        <p>
          This site is a <strong>full-stack web application</strong> I built from scratch.
          The landing page is rendered by <strong>Next.js 14</strong> running on
          <strong> Vercel</strong>, styled with <strong>Tailwind CSS</strong> and
          components from <strong>shadcn/ui</strong>. Everything you see is React on the
          frontend.
        </p>
        <p className="mt-3">
          Behind the scenes the app talks to a separate <strong>Hono backend</strong>{' '}
          deployed on <strong>Fly.io</strong>, which calls{' '}
          <strong>Claude Opus 4.7</strong> via the Anthropic API to generate the actual
          prompts. Course data is parsed from Pomfret&apos;s 2026–2027 curriculum guide
          (182 courses, organized by department + level) and lives in a shared TypeScript
          package both the frontend and backend import from.
        </p>
        <p className="mt-3">
          For the full architecture walkthrough, click <strong>How it works</strong> in
          the header.
        </p>
      </BehindTheScenes>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function BehindTheScenes({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
      </div>
      <h3 className="mt-1 text-xl font-semibold">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
