/**
 * Scrub the pasted `material` body out of an assembled prompt so it isn't
 * persisted in localStorage history. The wrapping structure is preserved
 * (so users can see which section was redacted) but the body is replaced
 * with a placeholder. Spec §8: pasted material is NOT persisted anywhere.
 */
export function redactMaterialForHistory(promptText: string): string {
  const REDACTED = '[material redacted — not stored locally]';
  return promptText
    // xml format: <material>...</material>
    .replace(/<material>[\s\S]*?<\/material>/g, `<material>\n${REDACTED}\n</material>`)
    // markdown format: ## MATERIAL\n\n<body>\n\n
    .replace(/(## MATERIAL\n\n)[\s\S]*?(?=\n\n## |\n\nStep \d|$)/g, `$1${REDACTED}`)
    // numbered-steps format: Step N — MATERIAL:\n<body>
    .replace(/(Step \d+ — MATERIAL:\n)[\s\S]*?(?=\n\nStep \d|\n\n## |$)/g, `$1${REDACTED}`);
}
