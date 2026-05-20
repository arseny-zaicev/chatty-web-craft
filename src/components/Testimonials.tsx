import kristapsPhoto from "@/assets/testimonials/kristaps.webp";
import { ScrollReveal } from "@/hooks/useScrollReveal";

type Testimonial = {
  id: string;
  name: string;
  role: string;
  companyLabel: string;
  companyHref: string;
  videoSrc: string;
  poster: string;
  orientation: "portrait" | "landscape";
  result?: string;
};

const testimonials: Testimonial[] = [
  {
    id: "pablo",
    name: "Pablo",
    role: "Founder",
    companyLabel: "sophias.io",
    companyHref: "https://sophias.io/",
    videoSrc:
      "https://xglfamaaotmwulglwcui.supabase.co/storage/v1/object/public/testimonials/pablo-sophias.mp4",
    poster:
      "https://xglfamaaotmwulglwcui.supabase.co/storage/v1/object/public/testimonials/pablo-sophias-poster.jpg",
    orientation: "landscape",
  },
  {
    id: "kristaps",
    name: "Kristaps",
    role: "Founder",
    companyLabel: "key-digital.lv",
    companyHref: "https://key-digital.lv",
    videoSrc:
      "https://xglfamaaotmwulglwcui.supabase.co/storage/v1/object/public/testimonials/kristaps-testimonial.mp4",
    poster: kristapsPhoto,
    orientation: "portrait",
    result: "500 messages → 8 meetings booked in 2 days",
  },
];

export { testimonials };
export type { Testimonial };

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-16">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Client Results
            </p>
            <h2 className="font-headline text-3xl md:text-5xl font-bold mb-5">
              What Our Clients Say
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Real results from businesses using our WhatsApp engine.
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8">
          {testimonials.map((t, idx) => (
            <ScrollReveal key={t.id} delay={100 + idx * 100}>
              <article className="bg-card border border-iskra-emerald/30 rounded-2xl p-6 shadow-lg hover-lift h-full flex flex-col">
                <div
                  className={`${
                    t.orientation === "portrait"
                      ? "aspect-[9/16] max-h-[560px]"
                      : "aspect-video"
                  } w-full mx-auto bg-black rounded-xl mb-6 overflow-hidden`}
                >
                  <video
                    src={t.videoSrc}
                    poster={t.poster}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-3 mt-auto">
                  <div>
                    <p className="font-semibold text-lg">{t.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.role},{" "}
                      <a
                        href={t.companyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-iskra-emerald hover:underline"
                      >
                        {t.companyLabel}
                      </a>
                    </p>
                  </div>
                  {t.result && (
                    <div className="bg-iskra-emerald/10 rounded-xl p-4 border border-iskra-emerald/20">
                      <p className="text-xs font-medium text-iskra-emerald mb-1 uppercase tracking-wider">
                        Result
                      </p>
                      <p className="font-display text-base md:text-lg font-bold">
                        {t.result}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};
