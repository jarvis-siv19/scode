const colorEnabled = () => process.stdout.isTTY === true && !process.env.NO_COLOR;

function ansi(code: string, value: string): string {
  return colorEnabled() ? `\u001b[${code}m${value}\u001b[0m` : value;
}

export const ui = {
  brand: (value: string) => ansi('1;38;5;203', value),
  accent: (value: string) => ansi('38;5;215', value),
  good: (value: string) => ansi('38;5;78', value),
  warn: (value: string) => ansi('38;5;221', value),
  bad: (value: string) => ansi('38;5;203', value),
  dim: (value: string) => ansi('2', value),
  bold: (value: string) => ansi('1', value),
};

export function section(title: string, subtitle?: string): string {
  return `${ui.brand('scode')} ${ui.dim('/')} ${ui.bold(title)}${subtitle ? `  ${ui.dim(subtitle)}` : ''}`;
}

export function table(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, column) => Math.max(
    header.length,
    ...rows.map((row) => (row[column] ?? '').length),
  ));
  const render = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  return [ui.dim(render(headers)), ui.dim(widths.map((width) => '─'.repeat(width)).join('  ')), ...rows.map(render)];
}
