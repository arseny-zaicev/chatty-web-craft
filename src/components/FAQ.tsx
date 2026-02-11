import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const faqData = [
  {
    question: "How does WhatsApp outreach work?",
    answer: "We use dedicated sending infrastructure — either physical phones with our custom software or well-warmed API accounts. The approach depends on your target country and database. Everything is tailored individually.",
  },
  {
    question: "How do you achieve 98% delivery rate?",
    answer: "Database validation is the key. Every contact is verified before sending — invalid numbers are filtered out, ensuring near-perfect delivery rates across campaigns.",
  },
  {
    question: "What kind of targeting is available?",
    answer: "We build databases by location, industry, company size, job title, and more. Alternatively, we can reactivate your warm database. Some clients need 50 messages/day, others 1000+.",
  },
  {
    question: "What's included in campaign management?",
    answer: "Full service: target list building, message copywriting, A/B testing, and daily sending with detailed analytics. We also offer AI-powered reply handling that books meetings automatically.",
  },
  {
    question: "How long does setup take?",
    answer: "The pilot launches within 3-5 business days. We handle account warm-up, copy creation, and database building. You start seeing replies from day one of the campaign.",
  },
  {
    question: "Do you offer a guarantee?",
    answer: "Every client gets a custom guarantee based on their goals. We align our success with yours — if we don't deliver what was promised, you don't pay for that period.",
  },
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-20">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              FAQ
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              Common Questions
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to know about WhatsApp outreach with ISKRA.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqData.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="glass-card rounded-2xl px-6 border-iskra-emerald/10 data-[state=open]:border-iskra-emerald/30 transition-colors"
                >
                  <AccordionTrigger className="text-left text-lg font-semibold hover:text-iskra-emerald transition-colors py-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
