import { Hairline, SectionHeader } from "../design-system";

export default function ControlRoomPage() {
    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader bracketed label="Control Room" />
            <Hairline />
            <p className="font-sans text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                Control room area
            </p>
        </section>
    );
}
