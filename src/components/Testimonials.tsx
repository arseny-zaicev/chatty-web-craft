import { useRef, useState } from "react";
import { Play } from "lucide-react";
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

const TestimonialCard = ({ t }: { t: Testimonial }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play();
    setPlaying(true);
  };

  return (
    <article className="group relative h-full min-h-[380px] md:min-h-[440px] bg-iskra-charcoal rounded-3xl overflow-hidden shadow-2xl border border-iskra-emerald/20 hover-lift flex flex-col">
      {/* Blurred backdrop from poster */}
      <div
        className="absolute inset-0 bg-center bg-cover scale-110 blur-2xl opacity-40"
        style={{ backgroundImage: `url(${t.poster})` }}
      />
      {/* Video letterboxed on top of backdrop */}
      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={videoRef}
          src={t.videoSrc}
          poster={t.poster}
          controls={playing}
          playsInline
          preload="metadata"
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="max-w-full max-h-full w-auto h-full object-contain"
        />
      </div>

      {/* Play overlay - hidden once playing */}
      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label={`Play testimonial from ${t.name}`}
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer group/play focus:outline-none"
        >
          <span className="absolute inset-0 bg-black/20 group-hover/play:bg-black/30 transition-colors" />
          <span className="relative flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-iskra-emerald text-iskra-charcoal shadow-2xl ring-4 ring-white/30 transition-transform group-hover/play:scale-110">
            <Play className="w-9 h-9 md:w-11 md:h-11 fill-current ml-1" />
          </span>
        </button>
      )}

      {/* Gradient overlay for caption legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

      {/* Caption */}
      <div className="relative z-10 mt-auto p-5 md:p-6 text-white pointer-events-none">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="pointer-events-auto">
            <p className="font-display text-lg md:text-xl font-bold leading-tight">
              {t.name}
            </p>
            <p className="text-xs md:text-sm text-white/75">
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
            <div className="pointer-events-auto bg-iskra-emerald/95 text-iskra-charcoal rounded-xl px-3 py-2 backdrop-blur-sm shadow-lg max-w-[240px]">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                Result
              </p>
              <p className="font-display text-xs md:text-sm font-bold leading-snug">
                {t.result}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-16">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Client Results
            </p>
            <h2 className="font-headline text-3xl md:text-5xl font-bold mb-4">
              What Our Clients Say
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Real results from businesses using our WhatsApp engine.
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {testimonials.map((t, idx) => {
            const isPortrait = t.orientation === "portrait";
            const colSpan = isPortrait ? "lg:col-span-5" : "lg:col-span-7";
            return (
              <ScrollReveal key={t.id} delay={100 + idx * 100} className={colSpan}>
                <TestimonialCard t={t} />
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};
