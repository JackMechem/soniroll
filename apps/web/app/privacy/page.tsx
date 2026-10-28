import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 20, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        soniroll (<LegalLink href="https://www.soniroll.com">soniroll.com</LegalLink>) is a free, non-commercial set of music practice tools run by Jack
        Mechem. This page says what it collects and why, in plain words.
      </p>

      <LegalSection title="The short version">
        <ul className="list-disc space-y-1 pl-5">
          <li>Every tool works without an account. Signed out, your stuff stays in your browser.</li>
          <li>With an account, your stuff is saved to soniroll&apos;s servers so it follows you between devices.</li>
          <li>Only what you choose to make public (a public profile, a post, a shared link) is seen by anyone else.</li>
          <li>soniroll counts which pages and tools get used, anonymously. No ads, no third-party trackers, nothing sold.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Signed out">
        <p>
          Your settings, tunes, chord charts, practice history and any audio files you open stay in your browser&apos;s own storage. They aren&apos;t
          sent to soniroll. Clearing your browser&apos;s data for soniroll.com deletes them.
        </p>
      </LegalSection>

      <LegalSection title="With an account">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Sign-in:</strong> your email address and password (stored hashed, so nobody can read it), or, with Google, your email and name.
          </li>
          <li>
            <strong>Your stuff:</strong> tool settings, how long you used each tool on each day (for its streak and stats), tune lists, chord charts, setlists, your Shed Log, your Shed Notes (with their templates and settings file), your Score Writer scores, recordings and any files you upload (PDFs,
            images, audio, video and so on, on their own or attached to a tune). Each account can store up to 100 MB.
            When you sign in, soniroll uses what&apos;s saved to the account; it doesn&apos;t merge in what was saved in that browser.
          </li>
          <li>
            <strong>Profile:</strong> your username, and if you add them, a picture, banner and instruments.
          </li>
          <li>Emailed confirmation codes are stored hashed and expire after 15 minutes.</li>
        </ul>
        <p>Slow Downer&apos;s audio files always stay in your browser, signed in or not.</p>
        <p>
          The Tuner and the Time Test listen through your mic only while you use them, and what they hear is never saved or sent anywhere. The Time
          Test keeps each take&apos;s results (its score and timing numbers) in its history, like other tool settings.
        </p>
      </LegalSection>

      <LegalSection title="What others can see">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Public profile</strong> (off until you turn it on): your username, picture, instruments, all your Tunes I Know and Tunes to Learn
            (names, keys, tempos; never your notes), ear-training levels and stars, who you follow and who follows you, and unless you turn it off, a
            Shed Log summary (streaks, hours, days practiced, milestones; never your routines, tasks or notes). Anyone can view it, with or without an
            account. Make it private again at any time.
          </li>
          <li>
            <strong>Posts and shared links:</strong> anything you post to Community, and any setlist, routine, tune or file you share by link, can be seen by
            whoever has it. Recordings attached to a shared setlist can be played by them too. A shared tune shows its keys, tempos, chord chart, the
            files attached to it and its recordings (never its notes), and whoever has the link can download those files and save a copy. A shared file
            can be opened, downloaded and copied the same way; your username shows only if your profile is public. Stop sharing
            at any time and the link stops working. A Shed Note you share with someone (by username) can be read by them, and changed by them if you
            let them edit; they see your username. A note&apos;s link opens it for the people you shared it with or, if you choose, for anyone who has the
            link (to read, with your username and the scores in it). If you also share the notes it links to, the same people and link can open
            the notes it links to (and, if you choose, the notes those link to, and so on), including ones you link later. Pictures and files you put in a note (pasting one saves it to your files) can
            be seen, played and downloaded by everyone who can open that note, and by your students when they&apos;re in a lesson&apos;s notes; a
            picture someone else pastes into a note you share with them is stored in their account. Turn the link off or remove someone and they
            can&apos;t open it any more.
          </li>
          <li>
            <strong>Lessons:</strong> once you join a teacher, they see a summary of your Shed Log, how you&apos;re doing on the routines they gave you
            (including notes and recordings on those), and anything you hand in. Not your other routines, notes or recordings. Lesson materials, hand-ins
            and booking details are shared only between the teacher and that student, and booking emails go to both. Leave a teacher at any time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Usage counts">
        <p>
          To see what&apos;s useful, soniroll counts, per day: visits, page views, which tools are started and how long they run, and whether a visit
          was signed in. Only daily totals are kept (for example, &quot;the Metronome was started 40 times on Tuesday&quot;). They aren&apos;t tied to
          you, your account or your device, and no IP address or advertising ID is stored. Nothing is counted if your browser sends Do Not Track or
          Global Privacy Control. Account activity soniroll already has (like when an account was created) is also summed into charts for the
          administrator.
        </p>
      </LegalSection>

      <LegalSection title="Feedback and reports">
        <p>
          When you send feedback or report a post or profile, soniroll keeps your message, the page you were on, your browser and device type, any
          screenshot you attach, and your account (or the email you typed if you&apos;re signed out), so it can be fixed and answered.
        </p>
      </LegalSection>

      <LegalSection title="Administration">
        <p>
          The administrators can see each account&apos;s email, username, sign-in method and sign-up date, read feedback, and remove posts or accounts
          that break the <LegalLink href="/terms">terms</LegalLink>. They don&apos;t browse your private stuff (your library, Shed Log, Shed Notes,
          recordings or notes).
        </p>
      </LegalSection>

      <LegalSection title="Cookies and browser storage">
        <p>Only what the site needs to work: keeping you signed in, your theme, tool settings and similar preferences. No ad or tracking cookies.</p>
      </LegalSection>

      <LegalSection title="Services soniroll uses">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <LegalLink href="https://www.convex.dev/legal/privacy">Convex</LegalLink> stores account data, synced data and uploaded files, and runs the
            server code.
          </li>
          <li>
            <LegalLink href="https://resend.com/legal/privacy-policy">Resend</LegalLink> sends soniroll&apos;s emails (sign-in codes, password resets,
            lesson emails).
          </li>
          <li>
            <LegalLink href="https://policies.google.com/privacy">Google</LegalLink> handles &quot;Sign in with Google&quot;, if you use it.
          </li>
          <li>
            <LegalLink href="https://vercel.com/legal/privacy-policy">Vercel</LegalLink> hosts the website and, like any web host, sees standard
            request details such as IP addresses.
          </li>
          <li>
            <LegalLink href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement">GitHub Pages</LegalLink> serves some of the
            piano and Rhodes samples straight to your browser (see <LegalLink href="/credits">Credits</LegalLink>).
          </li>
        </ul>
        <p>These may process data outside your country, including in the United States. soniroll doesn&apos;t sell or share data for advertising.</p>
      </LegalSection>

      <LegalSection title="Keeping and deleting">
        <p>
          Your data is kept while your account exists. Deleting your account (from the Account page) permanently removes it and everything tied to it:
          profile, posts, library, Shed Log, Shed Notes, scores, recordings, files, lessons and feedback. Daily usage totals aren&apos;t tied to anyone, so there&apos;s
          nothing of yours in them to delete.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>Passwords are stored hashed and traffic is encrypted (HTTPS). Nothing online is perfectly secure, so soniroll keeps only what it needs.</p>
      </LegalSection>

      <LegalSection title="Children">
        <p>soniroll isn&apos;t aimed at children under 13. If you think a child has made an account, get in touch and it will be removed.</p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          If this policy changes, this page and its date will be updated. Questions or requests about your data: use the{" "}
          <LegalLink href="/feedback">feedback page</LegalLink> (or a GitHub issue).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
