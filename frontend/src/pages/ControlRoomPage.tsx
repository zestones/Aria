import { Hairline, SectionHeader } from "../design-system";

export default function ControlRoomPage() {
    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader label="Control room" size="lg" meta={<span>Apr 22, 2026</span>} />
            <Hairline />
            <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                Operator console — panels land here as M6.3+ milestones ship.
            </p>
        </section>
    );
}
