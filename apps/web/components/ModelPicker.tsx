'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listProviders, listModelsForProvider } from '@/lib/model-profiles';

export function ModelPicker(props: {
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
}) {
  const providers = useMemo(() => listProviders(), []);
  const models = useMemo(() => listModelsForProvider(props.provider), [props.provider]);

  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="provider">Which LLM are you using?</Label>
        <Select value={props.provider} onValueChange={props.onProviderChange}>
          <SelectTrigger id="provider" className="mt-2">
            <SelectValue placeholder="Pick an LLM" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="model">Which model?</Label>
        <Select value={props.model} onValueChange={props.onModelChange}>
          <SelectTrigger id="model" className="mt-2">
            <SelectValue placeholder="Pick a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
