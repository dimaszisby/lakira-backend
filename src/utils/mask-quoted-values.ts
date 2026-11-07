/**
 * Masks what a database message quotes. Postgres quotes a submitted value in
 * some messages (`invalid input syntax for type uuid: "…"`) and does not escape
 * a quote inside it, so pairing quotes would leak the rest of such a value.
 * Everything from the first `"` to the last becomes `"[value]"`; a lone `"`
 * masks to the end. A message that also quotes an identifier loses it, and the
 * text up to the value: the logger keeps the SQLSTATE and the constraint, table
 * and column names in `db` (kit log-redaction-coverage, D-16).
 */
export const maskQuotedValues = (text: string): string => {
  const first = text.indexOf('"');
  if (first === -1) return text;
  const last = text.lastIndexOf('"');
  return last === first
    ? `${text.slice(0, first)}"[value]`
    : `${text.slice(0, first)}"[value]"${text.slice(last + 1)}`;
};
