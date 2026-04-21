export function buildAttributionLines(sources: string[]): string[] {
  return sources.length > 0
    ? [
        'This generated skill incorporates ideas or structure from the following sources:',
        '',
        ...sources.map((source) => `- ${source}`),
      ]
    : [
        'This generated skill was created from task requirements only.',
      ];
}
