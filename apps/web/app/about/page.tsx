import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          How this works
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          A walkthrough of the system I built.
        </h1>
      </header>

      <Section number="1" title="The problem I'm solving">
        <p>
          Pomfret students use LLMs (ChatGPT, Claude, Gemini) to study, but most paste
          their assignment and write something like <em>&quot;help me review this&quot;</em>{' '}
          and get a generic summary back. The LLM is capable of running a real
          quiz-driven study session — students just don&apos;t know how to ask for one.
        </p>
        <p className="mt-3">
          This site removes that gap. The student answers 6 short questions, and the
          system writes a custom prompt that tells the LLM exactly how to teach them.
        </p>
      </Section>

      <Section number="2" title="The architecture (three big pieces)">
        <p>
          The system is split into three services. Each one is independent, runs on
          different infrastructure, and can be deployed separately.
        </p>

        <ArchCard
          icon="🌐"
          title="Frontend"
          stack="Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui"
          host="Vercel"
        >
          <p>
            Everything visible on screen is rendered by Next.js. The wizard is a React
            state machine — each of the 6 steps is its own component sharing one form
            state. When a student finishes the form, the frontend sends the data as
            JSON to the backend.
          </p>
          <p className="mt-2">
            UI components come from <strong>shadcn/ui</strong>, which is built on top
            of <strong>Radix UI</strong> primitives — that gets me real accessibility
            for free (keyboard nav, screen reader support, focus management).
          </p>
        </ArchCard>

        <ArchCard
          icon="⚙️"
          title="Backend"
          stack="Hono + TypeScript + Drizzle ORM + bcrypt + Lucia auth"
          host="Fly.io"
        >
          <p>
            The backend is written in <strong>Hono</strong> — a modern JavaScript
            framework similar to Express but more portable. It runs as a Docker
            container on Fly.io, but I could move it to AWS, Cloudflare, or my laptop
            and it&apos;d run unchanged. That portability was one of my design goals.
          </p>
          <p className="mt-2">
            The backend handles the actual prompt generation — receiving form data from
            the frontend, calling the Anthropic API, persisting the result, returning
            the prompt to the user.
          </p>
          <p className="mt-2">
            It talks to a <strong>Postgres database</strong> (hosted on Neon, a
            serverless Postgres provider). Schema and migrations are managed by{' '}
            <strong>Drizzle ORM</strong>, which gives me type-safe queries — TypeScript
            knows the shape of every database row.
          </p>
        </ArchCard>

        <ArchCard
          icon="🧠"
          title="AI Model"
          stack="Anthropic API · Claude Opus 4.7"
          host="Anthropic"
        >
          <p>
            The actual prompt writing is done by <strong>Claude Opus 4.7</strong>,
            Anthropic&apos;s most capable model. The backend calls it with a custom
            system prompt that describes the <strong>Pomfret-Study Framework</strong>{' '}
            (the 7-section structure for every output prompt).
          </p>
          <p className="mt-2">
            If Opus is unavailable, or the daily budget cap is hit, the system falls
            back to building the prompt entirely from deterministic templates I wrote
            by hand. Lower quality, but always available — the wizard never breaks
            because of an upstream outage.
          </p>
        </ArchCard>
      </Section>

      <Section number="3" title="The Pomfret-Study Framework">
        <p>
          The core of this project isn&apos;t the code — it&apos;s the{' '}
          <strong>prompt structure</strong> I designed. Every prompt the system writes
          follows this exact 7-section pattern:
        </p>
        <ol className="mt-4 ml-4 list-decimal space-y-2 text-sm">
          <li><strong>Role</strong> — calibrated tutor persona (patient, rigorous, etc.) based on the student&apos;s confidence and the course&apos;s rigor</li>
          <li><strong>About Me</strong> — who the student is (course + level + confidence + what they understand + what confuses them)</li>
          <li><strong>Material</strong> — whatever the student pasted in</li>
          <li><strong>Goal &amp; Constraints</strong> — the assessment, the date, the time available, the study mode</li>
          <li><strong>Interaction Style</strong> — specific behavioral instructions for the tutor LLM, plus a sentence naming 2-3 likely misconceptions on the topic</li>
          <li><strong>Output Spec</strong> — the exact deliverable shape (e.g., &quot;10 questions with answers in a separate section&quot;)</li>
          <li><strong>Self-Check</strong> — quality gates the tutor LLM must apply</li>
        </ol>
        <p className="mt-4">
          This structure forces the tutor LLM to think pedagogically (active recall,
          spaced practice, formative checks) instead of just dumping information.
          It&apos;s based on real instructional design principles, adapted for one-on-one
          AI tutoring.
        </p>
      </Section>

      <Section number="4" title="Per-LLM tuning">
        <p>
          Different LLMs respond to different prompt formats. Claude prefers XML tags.
          GPT prefers markdown headers. Gemini prefers explicit numbered steps. So when
          a student picks their LLM in step 1, the system formats the output prompt
          accordingly.
        </p>
        <p className="mt-3">
          I maintain a <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
          model-profiles.json</code> file with 10 models across 3 providers (Anthropic
          Opus/Sonnet/Haiku, OpenAI GPT-5/4.1/o3/o1, Google Gemini Pro/Flash) plus a
          generic fallback. Each has a format preference, a flag for whether it&apos;s
          a reasoning model, and a long-context flag. The system picks the right format
          per request.
        </p>
      </Section>

      <Section number="5" title="The RAG learning system">
        <p>
          This is the most ambitious piece. RAG stands for{' '}
          <strong>Retrieval-Augmented Generation</strong>. The idea: as students use
          the system and rate prompts, the system gets smarter without me writing any
          new code.
        </p>
        <p className="mt-3">Here&apos;s how it works:</p>
        <ol className="mt-3 ml-4 list-decimal space-y-2 text-sm">
          <li>
            Every generated prompt is stored in Postgres, along with the wizard inputs
            and (after the student uses it) a 1–5 star rating + optional comment.
          </li>
          <li>
            When a new student fills out the wizard, before calling Opus the backend
            queries the database for past prompts with the same (course, study mode)
            combination that received high ratings.
          </li>
          <li>
            Those high-rated examples get injected into Opus&apos;s system prompt as
            <em> &quot;here&apos;s what worked for past students in this exact
            situation.&quot;</em> Opus reads them and adapts the spirit of what worked
            into the new prompt.
          </li>
          <li>
            For signed-in users, there&apos;s also a <strong>personal preference
            profile</strong> — a one-paragraph summary of their study style (auto-generated
            by a background job that reads their feedback history every 4 hours).
            That profile is injected as additional context.
          </li>
        </ol>
        <p className="mt-4">
          The result: a system that produces measurably better prompts on day 30 than
          on day 1, without me touching the code. It learns from collective feedback
          (what works for everyone) AND personal feedback (what works for you
          specifically).
        </p>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <strong>Honesty note:</strong> the RAG architecture is fully designed and the
          implementation plan is committed to the repo (40 tasks across 6 phases — see{' '}
          <code>docs/superpowers/plans/</code> in the GitHub repo). The frontend,
          backend, and database are deployed. The learning loop itself (phases E and F
          of the plan) is the next thing I&apos;m building.
        </p>
      </Section>

      <Section number="6" title="Privacy + safety">
        <p>
          Pasted assignment material is sensitive — it might be a teacher&apos;s
          original draft, or a student&apos;s notes they don&apos;t want others seeing.
          So the system never persists raw material anywhere:
        </p>
        <ul className="mt-3 ml-4 list-disc space-y-1 text-sm">
          <li>Material is used in the Opus call but never written to the database</li>
          <li>It&apos;s scrubbed out of the generated prompt before saving to history</li>
          <li>Server-side error logs redact it explicitly</li>
          <li>Feedback is stored against a SHA-256 hash of the prompt — never against an identifiable user</li>
        </ul>
        <p className="mt-3">
          Additional protections: a per-IP rate limit (20 generations per day max),
          and a hard daily spend cap ($10/day) that triggers the deterministic fallback
          if exceeded.
        </p>
      </Section>

      <Section number="7" title="Engineering practices I used">
        <ul className="ml-4 list-disc space-y-2 text-sm">
          <li>
            <strong>Monorepo</strong> with npm workspaces: <code>apps/web</code>,{' '}
            <code>apps/api</code>, and <code>packages/shared</code> (where types,
            templates, and curriculum data live, imported by both apps)
          </li>
          <li>
            <strong>Test-driven development (TDD)</strong> for the core logic — 99 unit
            and integration tests, plus one end-to-end test in Playwright that drives a
            real browser through the wizard
          </li>
          <li>
            <strong>Type-safe API contracts</strong>: the frontend and backend share
            TypeScript types via the shared package, so a request shape change in one
            forces a compile error in the other
          </li>
          <li>
            <strong>Continuous deployment</strong>: every commit to <code>main</code>{' '}
            triggers a Vercel rebuild (frontend) and a Fly.io rebuild (backend), with
            no manual steps
          </li>
          <li>
            <strong>Schema migrations</strong>: database changes are version-controlled
            SQL files generated by Drizzle, applied in order to keep dev and production
            databases in sync
          </li>
          <li>
            <strong>Secrets management</strong>: API keys and database URLs live in
            environment variables, set via Vercel and Fly.io secrets — never in the
            codebase
          </li>
        </ul>
      </Section>

      <Section number="8" title="What I learned building this">
        <ul className="ml-4 list-disc space-y-2 text-sm">
          <li>
            <strong>Prompts have real structure.</strong> Before this, I thought a
            prompt was just &quot;what you type into ChatGPT.&quot; Now I can name the
            7 sections of a good prompt and explain why each one matters. That mental
            model will outlast this project.
          </li>
          <li>
            <strong>AI quality is tied to context, not model size.</strong> A bigger
            model with worse inputs can lose to a smaller model with rich, specific
            inputs. Opus 4.7 with no course context produces a worse prompt than
            templates with deep course context. That trade-off shapes every design
            decision in this app.
          </li>
          <li>
            <strong>Secrets are different from code.</strong> I learned this the hard
            way — I accidentally pasted an API key, then later a database password,
            into places they shouldn&apos;t have gone. Rotating credentials and learning
            to handle them with care is a real engineering skill I now have.
          </li>
          <li>
            <strong>Real apps are layered.</strong> I started thinking I was building
            &quot;a website.&quot; By the end I was operating a frontend on Vercel, a
            backend on Fly.io, a database on Neon, and a model API on Anthropic — four
            different services, each with their own deployment, monitoring, and cost
            considerations.
          </li>
          <li>
            <strong>Designing for failure matters.</strong> The deterministic fallback
            is what keeps the app working when Anthropic has an outage or the budget
            cap hits. Every production system needs paths for when its dependencies
            misbehave.
          </li>
        </ul>
      </Section>

      <Section number="9" title="My recommendation for the class">
        <p>
          If you&apos;re thinking about a project like this, three things I&apos;d
          recommend:
        </p>
        <ol className="mt-3 ml-4 list-decimal space-y-2 text-sm">
          <li>
            <strong>Start with a real problem you have.</strong> Mine started because
            I was watching my friends type bad prompts. That gave me a clear way to
            judge every design decision — does this actually help students?
          </li>
          <li>
            <strong>Write the design before the code.</strong> I had a 200-line spec
            and a 600-line implementation plan before I wrote line 1 of code. That
            sounds excessive, but it saved me weeks of refactoring later. Every
            decision was made deliberately.
          </li>
          <li>
            <strong>Use AI to speed up the parts you understand.</strong> I used AI
            heavily as a coding partner, but only after I understood the architecture I
            wanted. If you delegate the thinking, you don&apos;t learn anything. If you
            delegate the typing, you ship 10x faster.
          </li>
        </ol>
      </Section>

      <div className="mt-16 flex flex-col gap-3 sm:flex-row">
        <Link href="/wizard">
          <Button size="lg">Try the wizard</Button>
        </Link>
        <Link href="https://github.com/kekeli0924-ctrl/COMPOSED-prompts" target="_blank" rel="noopener noreferrer">
          <Button size="lg" variant="outline">
            View source on GitHub
          </Button>
        </Link>
      </div>

      <footer className="mt-16 border-t pt-6 text-xs text-slate-500">
        <p>
          Built with Next.js, Hono, TypeScript, Tailwind, shadcn/ui, Drizzle ORM,
          Postgres, Vercel, Fly.io, and the Anthropic API. ~60 commits over two work
          sessions.
        </p>
      </footer>
    </main>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-slate-400">{number.padStart(2, '0')}</span>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-slate-700">{children}</div>
    </section>
  );
}

function ArchCard({
  icon,
  title,
  stack,
  host,
  children,
}: {
  icon: string;
  title: string;
  stack: string;
  host: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 rounded-lg border bg-white p-5">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {stack} <span className="mx-1.5 text-slate-300">·</span> Hosted on {host}
          </p>
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}
