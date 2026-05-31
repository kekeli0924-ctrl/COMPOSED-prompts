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
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/wizard">
          <Button size="lg">Start studying</Button>
        </Link>
        <Link href="/plan">
          <Button size="lg" variant="outline">
            Plan study time
          </Button>
        </Link>
        <Link href="/history">
          <Button size="lg" variant="ghost">
            My past prompts
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
