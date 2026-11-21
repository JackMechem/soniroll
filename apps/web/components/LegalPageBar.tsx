"use client";

import PageBar from "@/components/PageBar";
import { DocumentIcon, HeartIcon, ShieldIcon } from "@/components/tools";

/** The header bar of the legal pages (`LegalPage`, a server component, can't hand a client
    component an icon), with the icon the phone's top bar always used for each. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Credits: HeartIcon,
  "Privacy policy": ShieldIcon,
  "Terms of service": DocumentIcon,
};

export default function LegalPageBar({ title }: { title: string }) {
  return <PageBar crumbs={[{ label: title }]} icon={ICONS[title]} />;
}
