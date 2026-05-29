'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, type MaterialKind } from '@composed-prompts/shared';

const MAX = 20000;
const SOFT = 15000;

export function MaterialStep(props: {
  material: string;
  attachedMaterialKinds: MaterialKind[];
  onChange: (v: string) => void;
  onKindsChange: (kinds: MaterialKind[]) => void;
}) {
  const len = props.material.length;
  const selected = new Set(props.attachedMaterialKinds);

  const toggle = (k: MaterialKind): void => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    props.onKindsChange(MATERIAL_KINDS.filter((m) => next.has(m)));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Will you attach material to your AI when you study?</Label>
        <p className="text-sm text-slate-600">
          Attaching your own study guide or notes to ChatGPT/Claude makes a huge difference. Tell us
          what you&apos;ll attach and we&apos;ll build the prompt so your AI pulls the key topics out
          of it and quizzes you on them.
        </p>
        <div
          role="group"
          aria-label="What you'll attach to your AI"
          className="mt-1 flex flex-wrap gap-2"
        >
          {MATERIAL_KINDS.map((k) => {
            const on = selected.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {MATERIAL_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="material">Or paste material directly (optional)</Label>
        <Textarea
          id="material"
          value={props.material}
          onChange={(e) => props.onChange(e.target.value.slice(0, MAX))}
          placeholder="Paste topics or notes to bake straight into the prompt. This won't be stored anywhere."
          rows={8}
        />
        <div className="text-right text-xs text-slate-500">
          {len.toLocaleString()} / {MAX.toLocaleString()} characters
        </div>
        {len > SOFT && (
          <Alert>
            <AlertDescription>
              You&apos;re past {SOFT.toLocaleString()} characters. If your material is mostly noise
              (page numbers, headers), trimming improves prompt quality.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
