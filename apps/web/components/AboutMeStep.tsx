'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';

const CONF_LABELS: Record<number, string> = {
  1: 'Lost',
  2: 'Shaky',
  3: 'OK',
  4: 'Solid',
  5: 'Locked in',
};

export function AboutMeStep(props: {
  confidence: number | undefined;
  understanding: string;
  confusion: string;
  onChange: (next: { confidence?: number; understanding?: string; confusion?: string }) => void;
}) {
  const conf = props.confidence ?? 3;
  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="conf">How confident are you on the material? (optional)</Label>
        <div className="mt-3">
          <Slider
            id="conf"
            value={[conf]}
            min={1}
            max={5}
            step={1}
            onValueChange={(v) => props.onChange({ confidence: v[0] as 1 | 2 | 3 | 4 | 5 })}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{CONF_LABELS[1]}</span>
            <span className="font-medium text-foreground">{CONF_LABELS[conf] ?? ''}</span>
            <span>{CONF_LABELS[5]}</span>
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="under">What do you already understand? (optional)</Label>
        <Textarea
          id="under"
          value={props.understanding}
          onChange={(e) => props.onChange({ understanding: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder="One or two sentences about what makes sense to you."
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="conf-text">What confuses you? (optional)</Label>
        <Textarea
          id="conf-text"
          value={props.confusion}
          onChange={(e) => props.onChange({ confusion: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder="Be specific — the more concrete, the better the prompt."
          className="mt-2"
        />
      </div>
    </div>
  );
}
