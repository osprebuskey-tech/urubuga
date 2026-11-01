// A cell starting with = + - @ would be run as a formula by spreadsheet programs, and names here come from users. Defuse them.
const cell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (headers, rows) => [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads accents correctly
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
