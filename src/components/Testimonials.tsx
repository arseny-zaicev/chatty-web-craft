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

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {testimonials.map((t, idx) => {
            const isPortrait = t.orientation === "portrait";
            const colSpan = isPortrait ? "lg:col-span-5" : "lg:col-span-7";
            return (
              <ScrollReveal key={t.id} delay={100 + idx * 100} className={colSpan}>
                <article className="group relative h-full min-h-[520px] lg:min-h-[640px] bg-iskra-charcoal rounded-3xl overflow-hidden shadow-2xl border border-iskra-emerald/20 hover-lift flex flex-col">
                  {/* Video as full background */}
                  <div className="absolute inset-0">
                    <video
                      src={t.videoSrc}
                      poster={t.poster}
                      controls
                      playsInline
                      preload="metadata"
                      className={`w-full h-full ${isPortrait ? "object-cover" : "object-cover"}`}
                    />
                    {/* Gradient overlay for caption legibility */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                  </div>

                  {/* Caption */}
                  <div className="relative z-10 mt-auto p-6 md:p-7 text-white pointer-events-none">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                      <div className="pointer-events-auto">
                        <p className="font-display text-xl md:text-2xl font-bold leading-tight">
                          {t.name}
                        </p>
                        <p className="text-sm text-white/75">
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
                        <div className="pointer-events-auto bg-iskra-emerald/95 text-iskra-charcoal rounded-xl px-4 py-2 backdrop-blur-sm shadow-lg max-w-[260px]">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                            Result
                          </p>
                          <p className="font-display text-sm md:text-base font-bold leading-snug">
                            {t.result}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};
