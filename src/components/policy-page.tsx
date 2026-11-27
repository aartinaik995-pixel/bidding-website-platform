import { OPERATOR } from "@/lib/platform";

export type PolicySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export function PolicyPage({
  title,
  description,
  updated,
  sections,
}: {
  title: string;
  description: string;
  updated: string;
  sections: PolicySection[];
}) {
  return (
    <article className="mx-auto max-w-reading px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-primary uppercase">
        BidMySite policies
      </p>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
      <p className="mt-4 text-xs text-muted-foreground">Updated {updated}</p>

      <div className="mt-8 rounded-xl border bg-card p-4 text-sm">
        <p>
          <span className="font-semibold">Operator:</span> {OPERATOR.name}
        </p>
        <p>
          <span className="font-semibold">Privacy and support contact:</span>{" "}
          <a
            href={`mailto:${OPERATOR.contactEmail}`}
            className="font-medium text-primary underline"
          >
            {OPERATOR.contactEmail}
          </a>
        </p>
        <p className="mt-2 text-muted-foreground">
          Business location: Telangana, India. Governing law is India. A street
          address and business registration number are not stated on these
          pages.
        </p>
      </div>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold">{section.title}</h2>
            <div className="mt-3 space-y-3 text-muted-foreground">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="list-disc space-y-2 pl-5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
