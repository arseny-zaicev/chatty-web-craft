import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Bot, MessageCircle, Building } from "lucide-react";

type FAQCategory = "ai-agent" | "whatsapp" | "seller-leads";

const faqData: Record<FAQCategory, { question: string; answer: string }[]> = {
  "ai-agent": [
    {
      question: "How quickly can my AI agent be set up?",
      answer: "Setup takes 7 days, followed by at least 2 weeks of quality control to fine-tune responses and improve accuracy. During this period, we address any small issues to ensure maximum efficiency.",
    },
    {
      question: "What languages does the AI chatbot support?",
      answer: "Our AI agents support 50+ languages out of the box. We always fine-tune how the bots respond to achieve the most human-like answers. For unfamiliar languages, we work closely with clients to verify quality.",
    },
    {
      question: "Can I integrate the AI agent with my CRM?",
      answer: "Absolutely. Our AI agents integrate with popular CRMs like Salesforce, HubSpot, Pipedrive, and more. All statuses, conversations, and lead data sync automatically. We also support custom integrations via API or Zapier.",
    },
    {
      question: "How does the AI book meetings?",
      answer: "The AI handles the entire booking process through natural conversation — no clunky Calendly links. It negotiates time slots, checks availability, and confirms the meeting directly in the chat.",
    },
    {
      question: "Do you offer a guarantee?",
      answer: "Yes! Every client receives a custom guarantee based on their specific goals and expected results. We align our success with yours — if we don't deliver what was promised, you don't pay.",
    },
  ],
  "whatsapp": [
    {
      question: "How does the WhatsApp outreach work?",
      answer: "We use two unique approaches: sending from physical phones using our custom software, or leveraging very old, well-warmed API accounts that can handle the required volume. Everything depends on the country and database — we tailor the approach individually for each client.",
    },
    {
      question: "How do you ensure message delivery on WhatsApp?",
      answer: "The key is database validation. This is what allows us to achieve a 98% message delivery rate statistically. Every contact is verified before sending.",
    },
    {
      question: "What kind of targeting is available?",
      answer: "We build databases for outreach by location, industry, company size, job title, and more. Alternatively, we can reactivate your warm database or use your existing contacts. Depending on your needs, some clients need only 50 messages per day, others 1000+ per day.",
    },
    {
      question: "What's included in the campaign management?",
      answer: "Full service includes: target list building, message copywriting, A/B testing, and daily sending. We provide detailed statistics on messages sent and delivered. For reply handling, we can help you build an AI Agent that manages responses automatically — giving you clear daily analytics without manual work.",
    },
  ],
  "seller-leads": [
    {
      question: "What's included in the Seller Leads database?",
      answer: "You can choose any district or building. You'll get precise transaction information, property size, ownership details, and more. We update the data every quarter to ensure accuracy.",
    },
    {
      question: "How are the leads verified?",
      answer: "All phone numbers are WhatsApp-verified before delivery. We confirm the contact is active and reachable, ensuring you only pay for quality leads.",
    },
    {
      question: "Which areas do you cover?",
      answer: "We cover all major areas in Dubai including Downtown, Marina, Palm Jumeirah, JBR, Business Bay, and more. You choose the district, we deliver the leads.",
    },
    {
      question: "How quickly do I receive leads?",
      answer: "Leads are typically delivered instantly after we launch the campaign — we share them via Google Sheets. To start a campaign, we need to validate contacts and allocate accounts, which usually takes up to 3 days. Need it faster? We can expedite the process if you urgently need to find a seller.",
    },
    {
      question: "What's the cost per lead?",
      answer: "Pricing starts at 150 AED per verified lead. You only pay for leads who have responded positively — no wasted budget on cold contacts.",
    },
  ],
};

const categories: { id: FAQCategory; label: string; icon: typeof Bot }[] = [
  { id: "ai-agent", label: "AI Agent", icon: Bot },
  { id: "whatsapp", label: "WhatsApp Outreach", icon: MessageCircle },
  { id: "seller-leads", label: "Seller Leads", icon: Building },
];

export const FAQ = () => {
  const [activeCategory, setActiveCategory] = useState<FAQCategory>("ai-agent");

  return (
    <section id="faq" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Frequently Asked <span className="text-gradient">Questions</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about our services
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={activeCategory === category.id ? "default" : "outline"}
              className={`gap-2 ${
                activeCategory === category.id
                  ? "bg-iskra-emerald hover:bg-iskra-emerald-dark text-primary-foreground"
                  : "border-border hover:border-iskra-emerald/50 hover:text-iskra-emerald"
              }`}
              onClick={() => setActiveCategory(category.id)}
            >
              <category.icon className="w-4 h-4" />
              {category.label}
            </Button>
          ))}
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqData[activeCategory].map((faq, index) => (
              <AccordionItem
                key={`${activeCategory}-${index}`}
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
