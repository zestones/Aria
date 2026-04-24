const HEADER_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

export function formatHeaderDate(date: Date = new Date()): string {
    return HEADER_DATE_FORMATTER.format(date);
}
