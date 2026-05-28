import type { ModelFormat } from '../model-profiles.js';

export type Section = {
  name: string;
  body: string;
};

export function formatSection(format: ModelFormat, name: string, body: string, index = 1): string {
  const upper = name.toUpperCase();
  switch (format) {
    case 'xml':
      return `<${name}>\n${body}\n</${name}>`;
    case 'markdown':
      return `## ${upper}\n\n${body}`;
    case 'numbered-steps':
      return `Step ${index} — ${upper}:\n${body}`;
  }
}

export function formatAssembledPrompt(format: ModelFormat, sections: Section[]): string {
  return sections
    .map((s, i) => formatSection(format, s.name, s.body, i + 1))
    .join('\n\n');
}
