import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { ChevronDown, MessageCircle, Loader2 } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const faqs = [
  {
    question: "How quickly can we launch a campaign?",
    answer: "Typically 5–7 business days from kickoff. That includes strategy alignment, account setup, number warmup, and copy preparation. Some pilot campaigns launch even faster.",
  },
  {
    question: "What results can I expect?",
    answer: "Our benchmarks across industries: 35% average reply rate, ~1.3% booking rate from messages sent, and 98% delivery rate. Cold outreach averages 13% positive reply rate with 1% booking. Reactivation campaigns average 25% positive reply rate with 4% booking.",
  },
  {
    question: "How much does it cost?",
    answer: "Pricing depends on your target countries, total message volume, and additional work required to achieve results. We'll give you a clear custom quote on the demo call - no hidden fees.",
  },
  {
    question: "Will my number get blocked?",
    answer: "We use dedicated sending accounts with proper warmup and anti-block infrastructure - your personal or business number is never at risk. We manage all the technical side.",
  },
  {
    question: "What industries does this work for?",
    answer: "We've run successful campaigns for SaaS, coaching, real estate, e-commerce, professional services, and more. If your customers use WhatsApp, this works.",
  },
  {
    question: "Do I need to provide contacts?",
    answer: "For reactivation - yes, your existing database. For cold outreach - we can work with your list or help source contacts. For warm traffic - leads come from your existing funnel (ads, website, etc.).",
  },
];

export const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    if (phone.trim().length < 7) {
      toast({ title: "Please enter a valid phone number", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-form", {
        body: {
          form_type: "demo_request",
          contact_name: name.trim(),
          contact_phone: phone.trim(),
          data: { source: "faq_quick_contact" },
        },
      });
      if (error) throw error;
      setSubmitted(true);
      setName("");
      setPhone("");
      toast({ title: "Thanks! We'll be in touch shortly." });
    } catch (err) {
      console.error(err);
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="faq" className="py-24">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faqs.map(faq => ({
              "@type": "Question",
              "name": faq.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer,
              },
            })),
          })}
        </script>
      </Helmet>
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="tag-green mb-4 inline-block">FAQ</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Common Questions
            </h2>
          </div>
        </ScrollReveal>

        <div className="max-w-2xl mx-auto space-y-3">
          {faqs.map((faq, index) => (
            <ScrollReveal key={index} delay={index * 50}>
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="font-medium text-foreground pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openIndex === index && (
                  <div className="px-5 pb-5 text-muted-foreground text-sm leading-relaxed animate-fade-in">
                    {faq.answer}
                  </div>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="flex flex-col items-center text-center mt-10">
            <p className="text-muted-foreground text-sm mb-3">Still have a question?</p>
            <a
              href="https://wa.me/971568785008"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-iskra-emerald hover:text-iskra-emerald-light transition-colors font-semibold group"
            >
              <span>Chat with us on WhatsApp</span>
              <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};