"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AuthForm } from "@/components/AccountMenu";
import Logo from "@/components/Logo";
import {
  CalendarIcon,
  ChordChartIcon,
  CloseIcon,
  DrumIcon,
  EarIcon,
  GraduationCapIcon,
  MetronomeIcon,
  NAV_LINKS,
  NoteIcon,
  SetlistIcon,
} from "@/components/tools";
import { DASHBOARD_PATH } from "@/lib/landing";
import { PRESETS } from "@jam-practice/core/themes";
import { ChartPreview, ChordRun, IntervalQuiz, LiveBeats, StickingPreview, TunerPreview } from "./previews";
import { DemoProgressCard, RoutineDemo } from "./PracticeLogPreview";
import { FlameIcon } from "@/components/practicelog/Celebrations";

type AuthMode = "signIn" | "signUp" | null;

/**
 * The marketing landing page at "/" (the app itself starts at `/dashboard`). A standalone page
 * with its own nav, no app chrome (`AppChrome`). Its calls to action are an account (the app's own
 * sign-in form, in a modal; `?auth=login` opens it on arrival) or opening soniroll without one;
 * signed in, they become a link to the dashboard. The visuals are the app's real components
 * running live, plus real screenshots of the interface (`public/landing/`, one per light/dark).
 */
export default function Landing({ initialSignedIn, initialAuth = null }: { initialSignedIn: boolean; initialAuth?: AuthMode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthMode>(initialSignedIn ? null : initialAuth);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const signedIn = isLoading ? initialSignedIn : isAuthenticated;
  const goDashboard = () => router.push(DASHBOARD_PATH);

  const openApp = goDashboard;
  const signUp = () => setAuth("signUp");
  const logIn = () => setAuth("signIn");

  return (
    <div className="landing relative min-h-[100dvh] bg-background text-foreground" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <Nav signedIn={signedIn} onLogIn={logIn} onSignUp={signUp} />
      <Hero signedIn={signedIn} onSignUp={signUp} onOpenApp={openApp} onDashboard={goDashboard} />
      <Showcase />
      <PracticeLogSection />
      <TeachingSection />
      <ToolMarquee />
      <Features />
      <Bento />
      <Note />
      <FinalCta signedIn={signedIn} onSignUp={signUp} onOpenApp={openApp} onDashboard={goDashboard} />
      <Footer />
      {auth && <AuthModal mode={auth} onClose={() => setAuth(null)} onSuccess={goDashboard} />}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function PrimaryButton({ children, onClick, className = "" }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--foreground)_45%,transparent)] transition hover:-translate-y-px hover:shadow-[0_12px_28px_-8px_color-mix(in_srgb,var(--foreground)_50%,transparent)] active:translate-y-0 active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, className = "" }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-foreground/10 bg-surface px-6 py-3 text-sm font-semibold transition hover:bg-surface-hover active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Fades/slides children in the first time they scroll into view (static under reduced motion). */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "motion-safe:translate-y-6 motion-safe:opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

/** The screenshot set's folder. Bump it (and move the files) whenever the screenshots are retaken:
    Next caches optimized images by URL, so replacing a file in place keeps serving the old one. */
const SHOTS = "v4";

/** A real screenshot of the app, swapped for the dark-theme one in dark themes. */
function Shot({ name, alt, width, height, priority, className = "" }: { name: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  return (
    <>
      <Image src={`/landing/${SHOTS}/${name}-light.png`} alt={alt} width={width} height={height} priority={priority} className={`block h-auto w-full dark:hidden ${className}`} />
      <Image src={`/landing/${SHOTS}/${name}-dark.png`} alt={alt} width={width} height={height} priority={priority} className={`hidden h-auto w-full dark:block ${className}`} />
    </>
  );
}

function Nav({ signedIn, onLogIn, onSignUp }: { signedIn: boolean; onLogIn: () => void; onSignUp: () => void }) {
  return (
    <div className="sticky top-0 z-30 px-4 pt-4">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-2 rounded-full border border-foreground/[0.07] bg-surface/75 pl-5 pr-2 shadow-[0_8px_30px_-12px_color-mix(in_srgb,var(--foreground)_25%,transparent)] backdrop-blur-xl">
        <Link href="/" aria-label="soniroll home" className="shrink-0">
          <Logo height={34} />
        </Link>
        <div className="ml-6 hidden flex-1 items-center gap-1 text-sm font-medium text-muted md:flex">
          <a href="#practice-log" className="rounded-full px-3 py-1.5 transition hover:bg-background hover:text-foreground">Shed Log</a>
          <a href="#teaching" className="rounded-full px-3 py-1.5 transition hover:bg-background hover:text-foreground">Teaching</a>
          <a href="#tools" className="rounded-full px-3 py-1.5 transition hover:bg-background hover:text-foreground">Tools</a>
          <a href="#features" className="rounded-full px-3 py-1.5 transition hover:bg-background hover:text-foreground">Features</a>
          <a href="#free" className="rounded-full px-3 py-1.5 transition hover:bg-background hover:text-foreground">Why it&apos;s free</a>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {signedIn ? (
            <>
              <Link href="/account" className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-background">
                Account
              </Link>
              <Link href={DASHBOARD_PATH} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98]">
                Dashboard <Arrow />
              </Link>
            </>
          ) : (
            <>
              <button type="button" onClick={onLogIn} className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-background">
                Log in
              </button>
              <button type="button" onClick={onSignUp} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.98]">
                Sign up
              </button>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

type CtaProps = { signedIn: boolean; onSignUp: () => void; onOpenApp: () => void; onDashboard: () => void };

/** The page's two calls to action; signed in, just the way back to the dashboard. */
function Ctas({ signedIn, onSignUp, onOpenApp, onDashboard }: CtaProps) {
  if (signedIn) {
    return (
      <PrimaryButton onClick={onDashboard}>
        Go to your dashboard <Arrow />
      </PrimaryButton>
    );
  }
  return (
    <>
      <PrimaryButton onClick={onSignUp}>Sign up free</PrimaryButton>
      <SecondaryButton onClick={onOpenApp}>
        Try it without an account <Arrow />
      </SecondaryButton>
    </>
  );
}

/** A floating card around the hero, like objects scattered on a desk. */
function FloatCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={`landing-float absolute hidden rounded-3xl border border-foreground/[0.06] bg-surface p-4 shadow-[0_24px_60px_-20px_color-mix(in_srgb,var(--foreground)_30%,transparent)] xl:block ${className}`}
    >
      {children}
    </div>
  );
}

function Hero({ signedIn, onSignUp, onOpenApp, onDashboard }: CtaProps) {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-10 pt-16 sm:pt-24">
      {/* dot grid canvas, fading out toward the edges */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 14%, transparent) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />

      <FloatCard className="left-[4%] top-20 w-60 -rotate-3" style={{ animationDelay: "0s" }}>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
          <MetronomeIcon className="h-4 w-4 text-accent" /> Metronome
        </div>
        <div className="mb-3 flex items-baseline gap-1">
          <span className="text-4xl font-bold tabular-nums tracking-tight">112</span>
          <span className="text-sm text-muted">BPM · 4/4</span>
        </div>
        <LiveBeats bpm={112} size="sm" />
      </FloatCard>

      <FloatCard className="right-[4%] top-14 w-56 rotate-3" style={{ animationDelay: "-2s" }}>
        <TunerPreview />
      </FloatCard>

      <FloatCard className="bottom-24 left-[7%] w-64 rotate-2" style={{ animationDelay: "-4s" }}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
          <ChordChartIcon className="h-4 w-4 text-accent" /> Chord Charts
        </div>
        <ChordRun />
      </FloatCard>

      <FloatCard className="bottom-16 right-[6%] w-60 -rotate-2" style={{ animationDelay: "-1s" }}>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted">
          <CalendarIcon className="h-4 w-4 text-accent" /> Shed Log
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(160deg, #fb923c, #ef4444)" }}>
            <FlameIcon className="log-flame h-7 w-7" />
          </span>
          <div>
            <div className="text-3xl font-bold tabular-nums tracking-tight">42</div>
            <div className="text-xs font-semibold text-muted">day streak</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {"3424342 4334243".replace(" ", "").split("").map((l, i) => (
            <span key={i} className="aspect-square rounded-[3px]" style={{ background: ["#0e4429", "#006d32", "#26a641", "#39d353"][Number(l) - 1] }} />
          ))}
        </div>
      </FloatCard>

      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="landing-rise mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-foreground/[0.06] bg-surface shadow-[0_16px_40px_-16px_color-mix(in_srgb,var(--foreground)_35%,transparent)]">
          <Image src="/icon.svg" alt="" width={40} height={40} />
        </div>
        <h1 className="landing-rise text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl" style={{ animationDelay: "60ms" }}>
          Practice every day.
          <br />
          <span className="text-muted">Watch it add up.</span>
        </h1>
        <p className="landing-rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ animationDelay: "120ms" }}>
          Every practice tool in one shed — metronomes, ear training, chord charts, your tunes — and the Shed Log, which turns each session into streaks, goals and a year of green squares. Free, with no ads and no paywalls.
        </p>
        <div className="landing-rise mt-9 flex flex-col items-center gap-3 sm:flex-row" style={{ animationDelay: "180ms" }}>
          <Ctas signedIn={signedIn} onSignUp={onSignUp} onOpenApp={onOpenApp} onDashboard={onDashboard} />
        </div>
      </div>
    </section>
  );
}

/** The Shed Log: why it keeps you coming back, with a routine to tick off right here. */
function PracticeLogSection() {
  const points: [string, string][] = [
    ["Routines that repeat", "Lists of tasks with minutes and times — every weekday, every other Tuesday, whatever you need."],
    ["Run them on the timer", "Start a routine and each task counts down and checks itself off. Time in any tool counts too."],
    ["Streaks and a daily goal", "A flame by your name, a ring that fills up, confetti when you hit it. Miss a day and you'll see it."],
    ["Share the wins", "Post a routine, or a progress card with your year of practice, to Community — or anywhere."],
  ];
  return (
    <section id="practice-log" className="scroll-mt-24 px-4 pb-28">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
            <CalendarIcon className="h-4 w-4" /> Shed Log
          </p>
          <h2 className="max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">The hardest part is showing up. This makes it fun.</h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Plan what to practice, tick it off, and watch the days fill in. Every task gets a little burst and a rising note — finish the lot and the confetti comes out.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {points.map(([t, d]) => (
              <li key={t} className="flex flex-col gap-1">
                <span className="font-semibold">{t}</span>
                <span className="text-sm leading-relaxed text-muted">{d}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="flex flex-col gap-4">
          <RoutineDemo />
          <DemoProgressCard />
          <p className="text-center text-xs text-muted">Go on — tick them off.</p>
        </Reveal>
      </div>
    </section>
  );
}

/** Lessons: teachers and students, with the student page and one lesson as screenshots. */
function TeachingSection() {
  const points: [string, string][] = [
    ["A page for every lesson", "Notes, chord charts, files and assignments, kept with the lesson they're from."],
    ["Assignments they hand in", "Students tick them off or hand in a recording, a link or a file. You leave feedback."],
    ["See how practice is going", "Give a Shed Log routine and see the days they did it, and the time they put in."],
    ["Booking without the back-and-forth", "Set your hours, send a few times, and they pick one. Both get a calendar invite."],
  ];
  return (
    <section id="teaching" className="scroll-mt-24 px-4 pb-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-accent">
            <GraduationCapIcon className="h-4 w-4" /> For teachers and students
          </p>
          <h2 className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Everything from your lessons, in one place.</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Invite a student with a link. Each lesson gets its own page, the week&apos;s work goes in their Shed Log, and nothing gets lost in a text thread.
          </p>
        </Reveal>
        <div className="relative mt-12 grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Reveal className="overflow-hidden rounded-[24px] border border-foreground/[0.08] bg-surface p-2 shadow-[0_40px_100px_-30px_color-mix(in_srgb,var(--foreground)_45%,transparent)]">
            <div className="overflow-hidden rounded-[18px]">
              <Shot name="lessons" alt="A student's page in soniroll: their lessons, practice stats and booking" width={2560} height={1600} />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="overflow-hidden rounded-[24px] border border-foreground/[0.08] bg-surface p-2 shadow-[0_30px_80px_-30px_color-mix(in_srgb,var(--foreground)_40%,transparent)] lg:-ml-16 lg:mt-16">
              <div className="overflow-hidden rounded-[18px]">
                <Shot name="lesson" alt="One lesson in soniroll, with an assignment, a chord chart and notes" width={2560} height={1600} />
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal delay={160}>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {points.map(([t, d]) => (
              <li key={t} className="flex flex-col gap-1">
                <span className="font-semibold">{t}</span>
                <span className="text-sm leading-relaxed text-muted">{d}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/** The interface itself, in a browser frame, with a couple of the app's moments pinned on top. */
function Showcase() {
  return (
    <section className="relative px-4 pb-24">
      <Reveal className="relative mx-auto max-w-6xl">
        <div className="absolute -left-2 top-10 z-10 hidden items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-surface px-4 py-3 shadow-[0_20px_50px_-20px_color-mix(in_srgb,var(--foreground)_40%,transparent)] lg:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <NoteIcon className="h-5 w-5" />
          </span>
          <span className="text-sm">
            <span className="block font-semibold">Synced to your account</span>
            <span className="block text-muted">Tunes, charts and settings on every device</span>
          </span>
        </div>
        <div className="absolute -right-2 top-1/3 z-10 hidden items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-surface px-4 py-3 shadow-[0_20px_50px_-20px_color-mix(in_srgb,var(--foreground)_40%,transparent)] lg:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <MetronomeIcon className="h-5 w-5" />
          </span>
          <span className="text-sm">
            <span className="block font-semibold">Press / to search</span>
            <span className="block text-muted">Jump to any tool in a keystroke</span>
          </span>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-foreground/[0.08] bg-surface p-2 shadow-[0_40px_100px_-30px_color-mix(in_srgb,var(--foreground)_45%,transparent)]">
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="mx-auto rounded-full bg-background px-10 py-1 text-xs text-muted">soniroll.com</span>
          </div>
          <div className="overflow-hidden rounded-[20px]">
            <Shot name="app" alt="The soniroll interface: a sidebar of tools next to the Home dashboard" width={2880} height={1800} priority />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const TOOL_LINKS = NAV_LINKS.filter((l) => l.href !== "/");

/** Every tool, drifting by. The one marquee on the page: it shows breadth, not detail. */
function ToolMarquee() {
  const row = (
    <div className="flex shrink-0 items-center gap-3 pr-3">
      {TOOL_LINKS.map((l) => (
        <span key={l.href} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/[0.06] bg-surface px-4 py-2 text-sm font-medium">
          <l.icon className="h-4 w-4 text-accent" />
          {l.label}
        </span>
      ))}
    </div>
  );
  return (
    <section id="tools" className="scroll-mt-24 pb-28">
      <Reveal className="mx-auto mb-10 max-w-2xl px-4 text-center">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{TOOL_LINKS.length} tools, one tab</h2>
        <p className="mt-3 text-muted">Stop juggling a metronome app, a tuner app, a PDF of charts and a notes file.</p>
      </Reveal>
      <div className="group relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="landing-marquee flex group-hover:[animation-play-state:paused]">
          {row}
          <div aria-hidden className="flex">{row}</div>
        </div>
      </div>
    </section>
  );
}

const FEATURES: { id: string; title: string; body: string; icon: typeof MetronomeIcon; href: string; cta: string }[] = [
  { id: "metronome", title: "A metronome that keeps up", body: "Odd meters, subdivisions, accents per click, and structures that chain 11/8 into 12/8 and back.", icon: MetronomeIcon, href: "/metronome", cta: "Open the metronome" },
  { id: "charts", title: "Chord charts", body: "Read, write, transpose and import charts. Build playlists and open them on any device.", icon: ChordChartIcon, href: "/tunes?tab=charts", cta: "Open chord charts" },
  { id: "ear", title: "Ear training", body: "Guess intervals and chords on real piano samples, and drill the ones you keep missing.", icon: EarIcon, href: "/guess-the-interval", cta: "Open Guess the Interval" },
  { id: "sticks", title: "Sticking warmups", body: "Random sticking patterns and rolls in real notation, counted in and looped for drummers.", icon: DrumIcon, href: "/random-sticking-warmup", cta: "Open the warmup" },
  { id: "library", title: "Tunes and setlists", body: "Keep the tunes you know, the keys you know them in, and setlists you can share with the band.", icon: SetlistIcon, href: "/tunes", cta: "Open your tunes" },
];

function FeaturePreview({ id }: { id: string }) {
  switch (id) {
    case "metronome":
      return (
        <div className="flex flex-col items-center gap-8">
          <div className="text-center">
            <div className="text-7xl font-bold tabular-nums tracking-[-0.04em]">96</div>
            <div className="text-sm text-muted">BPM · eighth-note subdivision</div>
          </div>
          <div className="sm:hidden">
            <LiveBeats bpm={96} subdivision={2} size="sm" />
          </div>
          <div className="hidden sm:block">
            <LiveBeats bpm={96} subdivision={2} />
          </div>
        </div>
      );
    case "charts":
      return (
        <div className="w-full max-w-xl">
          <ChartPreview />
        </div>
      );
    case "ear":
      return <IntervalQuiz />;
    case "sticks":
      return <StickingPreview />;
    default:
      return (
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-foreground/[0.06] shadow-[0_24px_60px_-24px_color-mix(in_srgb,var(--foreground)_40%,transparent)]">
          <Shot name="setlist" alt="A setlist in soniroll, with each tune's key and tempo" width={2048} height={1280} />
        </div>
      );
  }
}

/** Pick a feature on the left, try it live on the right. */
function Features() {
  const [active, setActive] = useState(FEATURES[0].id);
  const feature = FEATURES.find((f) => f.id === active)!;
  return (
    <section id="features" className="scroll-mt-24 px-4 pb-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Try the real tools, right here</h2>
          <p className="mt-4 max-w-xl text-muted">Pick one and play with it.</p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
          <div role="tablist" aria-label="Features" className="flex flex-col">
            {FEATURES.map((f) => {
              const on = f.id === active;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(f.id)}
                  className={`group border-t border-foreground/10 py-4 text-left transition first:border-t-0 ${on ? "" : "hover:text-foreground"}`}
                >
                  <span className={`flex items-center gap-3 text-lg font-semibold tracking-tight transition ${on ? "text-foreground" : "text-muted"}`}>
                    <f.icon className={`h-5 w-5 transition ${on ? "text-accent" : "text-muted/60"}`} />
                    {f.title}
                  </span>
                  <span className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <span className="overflow-hidden">
                      <span className="block pl-8 pt-2 text-sm leading-relaxed text-muted">{f.body}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative flex min-h-[460px] flex-col overflow-hidden rounded-[28px] bg-surface/60 p-6 ring-1 ring-foreground/[0.06] sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
              style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 10%, transparent) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
            />
            <div key={active} className="landing-rise relative flex flex-1 items-center justify-center">
              <FeaturePreview id={active} />
            </div>
            <div className="relative mt-6 flex justify-end">
              <Link href={feature.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                {feature.cta} <Arrow />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A little app window recoloured with one of the real theme presets. */
function ThemeDemo() {
  const presets = PRESETS.slice(0, 8);
  const [i, setI] = useState(0);
  const c = presets[i].colors;
  const vars = Object.fromEntries(Object.entries(c).map(([k, v]) => [`--${k}`, v])) as CSSProperties;
  return (
    <div className="flex h-full flex-col gap-5">
      <div style={vars} className="flex flex-1 overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_20px_50px_-24px_rgba(0,0,0,0.45)] transition-colors duration-500">
        <div className="hidden w-40 shrink-0 flex-col gap-1 bg-surface p-3 sm:flex">
          <Logo height={22} className="mb-3" />
          {TOOL_LINKS.slice(3, 9).map((l, n) => (
            <span key={l.href} className={`flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-[11px] font-medium ${n === 1 ? "bg-accent text-accent-foreground" : "text-muted"}`}>
              <l.icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{l.label}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-5">
          <div className="text-center">
            <div className="text-4xl font-bold tabular-nums tracking-tight">120</div>
            <div className="text-[11px] text-muted">BPM · 4/4</div>
          </div>
          <LiveBeats bpm={120} size="sm" />
          <span className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground">Stop</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p, n) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setI(n)}
            aria-pressed={n === i}
            className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition active:scale-[0.97] ${n === i ? "border-foreground/30 bg-background" : "border-foreground/[0.07] hover:bg-background"}`}
          >
            <span className="flex h-5 w-5 overflow-hidden rounded-full ring-1 ring-foreground/10">
              <span className="w-1/2" style={{ background: p.colors.background }} />
              <span className="w-1/2" style={{ background: p.colors.accent }} />
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bento() {
  return (
    <section id="free" className="scroll-mt-24 px-4 pb-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Built for the practice room, not the pitch deck</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-6 md:grid-rows-[auto_auto]">
          <Reveal className="md:col-span-4 md:row-span-2">
            <div className="flex h-full flex-col rounded-[28px] bg-surface p-6 ring-1 ring-foreground/[0.06] sm:p-8">
              <h3 className="text-xl font-semibold tracking-tight">Make it yours</h3>
              <p className="mb-6 mt-1.5 max-w-md text-sm text-muted">Thirty themes, from Gruvbox to Rosé Pine, or build your own. Try a few.</p>
              <div className="flex-1">
                <ThemeDemo />
              </div>
            </div>
          </Reveal>

          <Reveal className="md:col-span-2" delay={80}>
            <div className="flex h-full flex-col justify-between gap-10 rounded-[28px] bg-accent p-6 text-accent-foreground sm:p-8">
              <span className="text-6xl font-semibold tracking-[-0.05em]">$0</span>
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Free. Actually free.</h3>
                <p className="mt-1.5 text-sm opacity-80">
                  No ads, no popups, every tool free. Want your files and recordings on all your devices?{" "}
                  <Link href="/plans" className="font-semibold underline underline-offset-2">
                    Storage plans
                  </Link>{" "}
                  are optional.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal className="md:col-span-2" delay={160}>
            <div className="flex h-full flex-col justify-between gap-6 rounded-[28px] bg-surface p-6 ring-1 ring-foreground/[0.06] sm:p-8">
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 rounded-2xl bg-background px-3 py-2.5 text-sm">
                  <SetlistIcon className="h-4 w-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-semibold">Friday gig</span>
                  <span className="text-xs text-muted">12 tunes</span>
                </span>
                <span className="flex items-center gap-2 self-end rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
                  Share link copied
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight">A community of players</h3>
                <p className="mt-1.5 text-sm text-muted">Share setlists and chord charts, follow other musicians, and save what they post.</p>
              </div>
            </div>
          </Reveal>

          <Reveal className="md:col-span-3" delay={80}>
            <div className="flex h-full items-end gap-6 overflow-hidden rounded-[28px] bg-surface p-6 pb-0 ring-1 ring-foreground/[0.06] sm:p-8 sm:pb-0">
              <div className="pb-6 sm:pb-8">
                <h3 className="text-xl font-semibold tracking-tight">No account needed</h3>
                <p className="mt-1.5 max-w-xs text-sm text-muted">Every tool works the moment you open it. Sign up only if you want your stuff to follow you.</p>
              </div>
              <div className="ml-auto w-36 shrink-0 translate-y-4 overflow-hidden rounded-t-[22px] border-x-4 border-t-4 border-foreground/10 sm:w-44">
                <Shot name="phone" alt="soniroll on a phone" width={780} height={1400} />
              </div>
            </div>
          </Reveal>

          <Reveal className="md:col-span-3" delay={160}>
            <div className="flex h-full flex-col gap-6 overflow-hidden rounded-[28px] bg-surface p-6 pb-0 ring-1 ring-foreground/[0.06] sm:p-8 sm:pb-0">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Split your screen</h3>
                <p className="mt-1.5 text-sm text-muted">Tile the metronome next to a warmup or a chord chart. Each pane keeps playing while you work in another.</p>
              </div>
              <div className="-mr-6 mt-auto overflow-hidden rounded-tl-2xl border-l border-t border-foreground/10 sm:-mr-8">
                <Shot name="split" alt="Two tools side by side in soniroll's split view" width={2100} height={1100} />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Jack's own note on why soniroll is free. */
function Note() {
  return (
    <section className="px-4 pb-28">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl">
          “I built soniroll to be the practice kit I wanted: everything in one place, and nothing in the way. There will never be ads, popups or paywalls.”
        </p>
        <p className="mt-6 text-sm text-muted">
          Jack Mechem, musician and developer
        </p>
        <a
          href="https://buymeacoffee.com/jackmechem"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          Servers aren&apos;t free. Buy me a coffee <Arrow />
        </a>
      </Reveal>
    </section>
  );
}

function FinalCta({ signedIn, onSignUp, onOpenApp, onDashboard }: CtaProps) {
  return (
    <section className="px-4 pb-16">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-surface px-6 py-20 text-center ring-1 ring-foreground/[0.06] sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
          style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 12%, transparent) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <div className="relative">
          <div className="mx-auto mb-8 w-fit">
            <LiveBeats bpm={100} />
          </div>
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Go shed.</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">Open a tool and start playing — today could be day one of your streak.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Ctas signedIn={signedIn} onSignUp={onSignUp} onOpenApp={onOpenApp} onDashboard={onDashboard} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-4 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-foreground/10 pt-8 text-sm text-muted sm:flex-row">
        <Logo height={28} />
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a href="https://github.com/JackMechem/sheddex" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
          <Link href="/feedback" className="hover:text-foreground">Feedback</Link>
          <Link href="/changelog" className="hover:text-foreground">What&apos;s new</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/credits" className="hover:text-foreground">Credits</Link>
        </div>
        <span>Made by musicians, for musicians.</span>
      </div>
    </footer>
  );
}

function AuthModal({ mode, onClose, onSuccess }: { mode: "signIn" | "signUp"; onClose: () => void; onSuccess: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={mode === "signUp" ? "Sign up" : "Log in"}
        onClick={(e) => e.stopPropagation()}
        className="landing-rise relative flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-surface p-6 text-left shadow-2xl"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
          <CloseIcon className="h-4 w-4" />
        </button>
        <AuthForm initialFlow={mode} onClose={onClose} onSuccess={onSuccess} googleRedirectTo={DASHBOARD_PATH} />
      </div>
    </div>
  );
}
