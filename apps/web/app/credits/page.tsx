import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Credits",
};

export default function CreditsPage() {
  return (
    <LegalPage title="Credits" updated="November 23, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        Most of soniroll&apos;s sounds are synthesized in the browser. The rest are real recordings:
        the <strong>Piano</strong> and <strong>Rhodes</strong> tones in the trainers, and Rhythm
        Section&apos;s piano, Rhodes, bass and drums. Some of them are licensed under Creative Commons
        Attribution (<LegalLink href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</LegalLink> or{" "}
        <LegalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</LegalLink>), which requires
        crediting them, and the others are too good not to name. This page is that
        credit, along with the people and other work soniroll is built on.
      </p>

      <LegalSection title="Piano">
        <p>
          Samples from the{" "}
          <LegalLink href="https://archive.org/details/SalamanderGrandPianoV3">
            Salamander Grand Piano
          </LegalLink>
          , recorded by Alexander Holm, mp3-encoded and hosted by the{" "}
          <LegalLink href="https://tonejs.github.io/">Tone.js</LegalLink> project.
        </p>
      </LegalSection>

      <LegalSection title="Rhodes">
        <p>
          The Rhodes, in the trainers and in Rhythm Section&apos;s chords, is{" "}
          <LegalLink href="https://github.com/sfzinstruments/jlearman.jRhodes3d">jRhodes3d</LegalLink> by Jeff Learman (a 1977 Rhodes Mark I
          Stage 73), licensed under{" "}
          <LegalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</LegalLink> and served by soniroll itself as trimmed mono
          mp3s.
        </p>
      </LegalSection>

      <LegalSection title="Rhythm Section's bass">
        <p>
          The bass in Rhythm Section (it started out as its own tool, Bass Genius) was Rob Moreno&apos;s idea, and Rob wrote the Ray Brown
          transcription (&quot;Cool Walk&quot;, two choruses of rhythm changes) that comes with it — the line its built-in Ray Brown player
          learns from.
        </p>
      </LegalSection>

      <LegalSection title="Find the Root">
        <p>
          Find the Root — hearing a rootless voicing and finding the root that completes it — was Rob Moreno&apos;s idea.
        </p>
      </LegalSection>

      <LegalSection title="Rhythm Section chords">
        <p>
          The piano comping in Rhythm Section uses the velocity-layered{" "}
          <LegalLink href="https://archive.org/details/SalamanderGrandPianoV3">Salamander Grand Piano</LegalLink> (Alexander Holm,{" "}
          <LegalLink href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</LegalLink>), as hosted by the{" "}
          <LegalLink href="https://github.com/tambien/Piano">Tone.js Piano</LegalLink> project. The Rhodes is jRhodes3d (see Rhodes above),
          with three of its velocity layers.
        </p>
      </LegalSection>

      <LegalSection title="Rhythm Section drums">
        <p>
          The drummer plays{" "}
          <LegalLink href="https://github.com/sfzinstruments/virtuosity_drums">Virtuosity Drums</LegalLink> by Versilian Studios and Karoryfer
          Samples (<LegalLink href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</LegalLink>), a contemporary jazz kit recorded at
          Virtuosity Musical Instruments in Boston, served by soniroll itself as mono mp3s (mic pairs mixed): its ride, hi-hat, snare, cross-stick,
          rimshot, toms, bass drum and crash, and the same release&apos;s cowbell and woodblock.
        </p>
      </LegalSection>

      <LegalSection title="How this works">
        <p>
          The piano samples don&apos;t ship with soniroll itself — your browser fetches the specific
          notes a tool actually plays directly from the hosts above (all GitHub Pages), the first time
          each one comes up, and keeps them for the rest of that browser tab so repeats are
          instant. The Rhodes, bass and drums come from soniroll itself. See the{" "}
          <LegalLink href="/privacy">Privacy policy</LegalLink> for what that means for your
          browser&apos;s outgoing requests.
        </p>
      </LegalSection>

      <LegalSection title="Upright bass">
        <p>
          Rhythm Section&apos;s bass is{" "}
          <LegalLink href="https://github.com/sfzinstruments/karoryfer.meatbass">Meatbass</LegalLink>{" "}
          by Karoryfer Samples — a 1958 Otto Rubner double bass, played pizzicato and mapped by D.
          Smolken, recorded by Ludwik Zamenhof. It&apos;s released under{" "}
          <LegalLink href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</LegalLink>, so
          no credit is required, but it&apos;s too good not to name. Unlike the piano, these samples
          are served by soniroll itself (converted to mp3).
        </p>
      </LegalSection>

      <LegalSection title="Word list">
        <p>
          Shed Notes&apos; word suggestions come from{" "}
          <LegalLink href="http://wordlist.aspell.net/">SCOWL</LegalLink> (Spell Checker Oriented
          Word Lists), copyright 2000–2016 by Kevin Atkinson, used under its permissive license (the
          full notice is at the top of the word list file soniroll serves), with some music words
          added by soniroll.
        </p>
      </LegalSection>

      <LegalSection title="Typeface">
        <p>
          Chord Charts sets chord symbols in{" "}
          <LegalLink href="https://github.com/steinbergmedia/petaluma">Petaluma</LegalLink>, the
          music notation font family Steinberg built for its Dorico scoring software — specifically
          <strong> Petaluma Script</strong> (a hand-inked text face) for the letters and numbers,
          paired with <strong>Petaluma</strong> itself for the major-seventh and diminished chord
          symbols, which it draws as real engraved marks rather than a stand-in character from an
          ordinary font. Unlike the audio above, both are bundled with soniroll itself rather than
          fetched from elsewhere, under Steinberg&apos;s own{" "}
          <LegalLink href="https://scripts.sil.org/OFL">SIL Open Font License 1.1</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="Checkout">
        <p>
          The storage plans&apos; checkout opens over the page with{" "}
          <LegalLink href="https://www.npmjs.com/package/@polar-sh/checkout">Polar&apos;s embedded checkout</LegalLink> script, by Polar Software, Inc.,
          bundled with soniroll under the{" "}
          <LegalLink href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
