import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 17, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        These terms cover your use of soniroll (
        <LegalLink href="https://www.soniroll.com">soniroll.com</LegalLink>, and its desktop app), a
        collection of music practice tools built and operated by Jack Mechem. By using the site,
        you agree to these terms. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <LegalSection title="The service">
        <p>
          Every tool and feature of soniroll is free, as a personal project, with no guarantee of
          uptime, accuracy, or continued availability. Most tools run entirely in your browser;
          creating an account is optional — see the{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> for exactly what an account does
          and doesn&apos;t do. The only thing that costs money is an optional storage plan (below).
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <ul className="list-disc space-y-1 pl-5">
          <li>You&apos;re responsible for keeping your password (if you have one) confidential.</li>
          <li>
            You&apos;re responsible for the accuracy of the email address and any other
            information you provide.
          </li>
          <li>
            You can delete your own account at any time, from the account page — this is
            permanent and can&apos;t be undone by soniroll once done.
          </li>
          <li>
            soniroll may suspend or terminate an account for misuse of the service, at its own
            discretion.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use soniroll for anything unlawful.</li>
          <li>
            Attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to
            soniroll or the services it depends on.
          </li>
          <li>
            Use automated tools to scrape or abuse the site in a way that degrades it for other
            users.
          </li>
          <li>Impersonate another person or misrepresent your affiliation with anyone.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep all rights to what you make or upload — tunes, chord charts, recordings,
          setlists, routines, files, lesson materials, posts and profile pictures. You&apos;re responsible
          for having the right to use whatever you upload (for example, not uploading copyrighted
          recordings or scans you don&apos;t have permission to share). By posting something
          publicly (a public profile, a Community post, a shared link), you let soniroll show it to
          the people it&apos;s shared with.
        </p>
      </LegalSection>

      <LegalSection title="Community and moderation">
        <p>When you post publicly or share with other people, don&apos;t post anything that:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Harasses, threatens, or targets anyone.</li>
          <li>Is hateful, sexually explicit, or otherwise not something you&apos;d show a room of musicians of all ages.</li>
          <li>Is spam or advertising.</li>
          <li>Isn&apos;t yours to share.</li>
        </ul>
        <p>
          Anyone can report a post or profile with the Report button. soniroll may remove posts,
          make profiles private, or delete accounts that break these rules, at its discretion and
          without notice. This is a small, one-person project, so moderation is done by hand.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          The soniroll name, design, and its original source code belong to Jack Mechem. soniroll
          is built with a number of open-source libraries, each under their own license; using
          soniroll doesn&apos;t grant you any license to soniroll&apos;s own code or design beyond
          what&apos;s stated in its{" "}
          <LegalLink href="https://github.com/JackMechem/sheddex">
            public GitHub repository
          </LegalLink>
          , if anything.
        </p>
      </LegalSection>

      <LegalSection title="Storage plans">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            On the free plan, your files, recordings and tune songs are kept on the device that
            saved them. They&apos;re your responsibility: if a browser deletes them (for example
            when you clear its data), soniroll can&apos;t get them back, so keep backups of
            anything that matters.
          </li>
          <li>
            A storage plan keeps them online, up to the plan&apos;s size. Plans are sold by Polar
            (polar.sh), who takes the payment as the seller, so Polar&apos;s terms also apply to the
            purchase. A plan renews automatically each month or year until you cancel.
          </li>
          <li>
            Cancel any time from Manage plan on the storage plans page; the plan runs to the end of
            the period you paid for. After that, files already online stay there and can still be
            opened, downloaded or moved to a device, but nothing more can be added online beyond
            the free space.
          </li>
          <li>
            Prices can change; a change applies from your next renewal, and you&apos;ll be told
            before it does.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          soniroll relies on third-party services (currently Convex, Resend, Google, Vercel and Polar —
          see the Privacy Policy for what each is used for) to provide accounts, email and payments. Those
          services have their own terms, and soniroll isn&apos;t responsible for their
          availability, changes, or errors.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          soniroll is provided &quot;as is&quot; and &quot;as available,&quot; without warranties
          of any kind, express or implied — including that it will be uninterrupted, error-free,
          or fit for any particular purpose. Several parts of the app (in particular, the audio
          tools) haven&apos;t been tested against every possible device, browser, or piece of
          hardware. Use it accordingly, and don&apos;t rely on it as your only copy of anything
          irreplaceable — export or back up anything important.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Jack Mechem won&apos;t be liable for any
          indirect, incidental, or consequential damages arising from your use of, or inability to
          use, soniroll — including loss of data stored in your own browser.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms, and the service itself, may change over time. Continuing to use soniroll
          after a change means you accept the updated terms. The date at the top of this page
          reflects the last change.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the State of California, USA, without regard to
          its conflict-of-laws principles, and any dispute will be handled in the state or federal
          courts located in Los Angeles County, California.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can be sent from the{" "}
          <LegalLink href="/feedback">feedback page</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
