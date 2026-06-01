import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/button';
import { ShowcaseHeader } from '@/components/ShowcaseHeader';

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');
  return (
    <>
      <ShowcaseHeader />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground">
          Better study prompts for Pomfret students.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Tell us your course, the assessment, and how you study best. Get back a
          prompt that&apos;s tuned to your LLM and your situation — the kind of
          prompt that gets a real study session, not a generic summary.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/wizard"><Button size="lg">Start studying</Button></Link>
          <Link href="/plan"><Button size="lg" variant="outline">Plan study time</Button></Link>
          <Link href="/history"><Button size="lg" variant="ghost">My past prompts</Button></Link>
        </div>
      </main>
    </>
  );
}
