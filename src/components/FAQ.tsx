import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How quickly can my AI agent be set up?",
    answer: "Most AI agents are live within 3-5 business days. We handle all the technical setup, training, and integration with your existing systems. You'll receive a demo before going live.",
  },
  {
    question: "What languages does the AI chatbot support?",
    answer: "Our AI agents support 50+ languages including English, Arabic, Russian, Hindi, Chinese, and more. The bot automatically detects and responds in the customer's preferred language.",
  },
  {
    question: "How does the WhatsApp outreach work?",
    answer: "We use aged, warmed-up WhatsApp accounts to send personalized messages to your target audience. All contacts are validated, and we handle the entire campaign — from copy approval to daily analytics.",
  },
  {
    question: "What's included in the Seller Leads database?",
    answer: "You get access to property owner contacts including WhatsApp-verified phone numbers, property details, ownership history, and building information. Data is updated daily and exclusive to you.",
  },
  {
    question: "Do you offer a guarantee?",
    answer: "Yes! We offer a 30-day money-back guarantee on all services. If you're not satisfied with the results, we'll refund you — no questions asked.",
  },
  {
    question: "Can I integrate the AI agent with my CRM?",
    answer: "Absolutely. Our AI agents integrate with popular CRMs like Salesforce, HubSpot, Pipedrive, and more. We also support custom integrations via API or Zapier.",
  },
  {
    question: "How do you ensure message delivery on WhatsApp?",
    answer: "We maintain a 98%+ delivery rate by using aged accounts (5+ years), proper warm-up procedures, and smart sending patterns. Each campaign is monitored in real-time for optimal performance.",
  },
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Frequently Asked <span className="text-gradient">Questions</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about our services
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="glass-card rounded-2xl px-6 border-iskra-emerald/10 data-[state=open]:border-iskra-emerald/30 transition-colors"
              >
                <AccordionTrigger className="text-left text-lg font-semibold hover:text-iskra-emerald transition-colors py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-foreground/70 text-base leading-relaxed pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
