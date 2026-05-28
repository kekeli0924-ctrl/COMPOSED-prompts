type RagPanelProps = {
  eyebrow: string;
  title?: string;
};

export function RagPanel({
  eyebrow,
  title = 'How this system gets smarter every time someone uses it',
}: RagPanelProps) {
  return (
    <section className="rounded-lg border-2 border-dashed border-slate-300 bg-white/80 p-6 backdrop-blur-sm">
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-600">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
        <p>
          <strong>RAG</strong> stands for <strong>Retrieval-Augmented Generation</strong>{' '}
          — a technique used by every major AI product released in the past year (ChatGPT
          with memory, Claude with projects, Perplexity, Cursor). It&apos;s how AI systems
          learn from accumulating data without needing to be retrained.
        </p>
        <p>
          <strong>How it works in this app:</strong> every prompt the system generates is
          saved in a Postgres database, along with whatever rating the student gives it
          afterwards. When a NEW student fills out the wizard for the same course and
          study mode, the backend{' '}
          <em>retrieves the highest-rated past prompts</em> and injects them into Opus
          4.7&apos;s system message as examples — &quot;here&apos;s what worked for past
          students in this exact situation.&quot;
        </p>
        <p>
          Opus reads those examples and <em>adapts the spirit of what worked</em> into
          the new prompt it&apos;s writing right now. It doesn&apos;t copy them verbatim
          — it uses them as taste signals.
        </p>
        <p>
          <strong>Personal layer:</strong> for signed-in users, the system also maintains
          a one-paragraph <em>preference profile</em> describing their study style. A
          background job rebuilds it every 4 hours from the student&apos;s feedback
          history. That profile gets injected as additional context so prompts feel
          custom to each person.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <RagStat number="0" label="prompts in the RAG index today" sublabel="(cold start)" />
        <RagStat number="∞" label="quality ceiling" sublabel="grows with usage" />
        <RagStat
          number="$0"
          label="marginal cost per training cycle"
          sublabel="vs. fine-tuning a model"
        />
      </div>

      <p className="mt-5 text-xs italic leading-relaxed text-slate-500">
        The result: a system that produces measurably better prompts on day 30 than on
        day 1, without me writing any new code. It learns from collective feedback (what
        works for everyone) AND personal feedback (what works for you specifically).
      </p>
    </section>
  );
}

function RagStat({
  number,
  label,
  sublabel,
}: {
  number: string;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="rounded border bg-slate-50 p-3 text-center">
      <div className="font-serif text-3xl italic text-indigo-700">{number}</div>
      <div className="mt-1 text-xs font-medium leading-tight text-slate-700">{label}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{sublabel}</div>
    </div>
  );
}
