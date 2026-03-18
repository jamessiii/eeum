export function nowIso(): string {
  return new Date().toISOString();
}

export function monthKey(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function excelSerialToIso(serial: number | null | undefined): string {
  if (!serial || Number.isNaN(serial)) return nowIso();

  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = serial - Math.floor(serial) + 0.0000001;
  const totalSeconds = Math.floor(86400 * fractionalDay);

  dateInfo.setUTCHours(Math.floor(totalSeconds / 3600));
  dateInfo.setUTCMinutes(Math.floor((totalSeconds % 3600) / 60));
  dateInfo.setUTCSeconds(totalSeconds % 60);
  return dateInfo.toISOString();
}
