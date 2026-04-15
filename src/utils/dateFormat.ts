export function formatPaymentDate(input?: string | number | Date): string | null {
  if (!input) return null;

  let date: Date | null = null;

  // Case 1: Already Date object
  if (input instanceof Date) {
    date = input;
  }

  // Case 2: Timestamp (number)
  else if (typeof input === "number") {
    date = new Date(input);
  }

  // Case 3: String input
  else if (typeof input === "string") {
    // DD/MM/YYYY or DD/MM/YYYY HH:mm:ss
    const ddmmyyyy = input.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
    );

    if (ddmmyyyy) {
      const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = ddmmyyyy;

      date = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(min),
        Number(ss)
      );
    } else {
      // Fallback: try native parsing (ISO, etc.)
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
  }

  // Final validation
  if (!date || isNaN(date.getTime())) return null;

  return date.toISOString();
}