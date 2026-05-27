'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MAX = 20000;
const SOFT = 15000;

export function MaterialStep(props: {
  material: string;
  onChange: (v: string) => void;
}) {
  const len = props.material.length;
  return (
    <div className="grid gap-3">
      <Label htmlFor="material">Paste assignment details, topics, or your notes (optional)</Label>
      <Textarea
        id="material"
        value={props.material}
        onChange={(e) => props.onChange(e.target.value.slice(0, MAX))}
        placeholder="The more you share, the better the prompt. This won't be stored anywhere."
        rows={10}
      />
      <div className="text-xs text-slate-500 text-right">
        {len.toLocaleString()} / {MAX.toLocaleString()} characters
      </div>
      {len > SOFT && (
        <Alert>
          <AlertDescription>
            You&apos;re past {SOFT.toLocaleString()} characters. If your material is mostly noise (page numbers, headers), trimming improves prompt quality.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
