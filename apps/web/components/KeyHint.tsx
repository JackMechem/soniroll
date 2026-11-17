function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm bg-foreground/[0.05] px-1.5 py-0.5 font-sans text-[0.7rem] font-medium text-foreground">
      {children}
    </kbd>
  );
}

/** Small keyboard-shortcut hint shown under a page's main button. Hidden on mobile, since
    there's no physical keyboard to press the shortcut on. */
export default function KeyHint({ children }: { children: React.ReactNode }) {
  return <p className="-mt-4 hidden text-xs text-muted sm:block">{children}</p>;
}

KeyHint.Key = Kbd;
