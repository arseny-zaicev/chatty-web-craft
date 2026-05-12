import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const Privacy = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | ISKRA</title>
        <meta name="description" content="Privacy Policy for ISKRA - Learn how we collect, use, and protect your personal information." />
        <link rel="canonical" href="https://iskra.ae/privacy" />
        <meta property="og:title" content="Privacy Policy | ISKRA" />
        <meta property="og:description" content="How ISKRA collects, uses, and protects your personal information." />
        <meta property="og:url" content="https://iskra.ae/privacy" />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content="Privacy Policy | ISKRA" />
        <meta name="twitter:description" content="How ISKRA collects, uses, and protects your personal information." />
      </Helmet>
      
      <main className="min-h-screen">
        <Navbar />
        
        <section className="pt-32 pb-24">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-8">
              Privacy <span className="text-gradient">Policy</span>
            </h1>
            
            <div className="prose prose-invert max-w-none space-y-8">
              <p className="text-lg text-foreground/80">
                Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">1. Information We Collect</h2>
                <p className="text-foreground/70">
                  We collect information you provide directly to us, such as when you fill out a contact form, 
                  request a consultation, or communicate with us. This may include your name, email address, 
                  phone number, company name, and any other information you choose to provide.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">2. How We Use Your Information</h2>
                <p className="text-foreground/70">
                  We use the information we collect to:
                </p>
                <ul className="list-disc list-inside text-foreground/70 space-y-2">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Communicate with you about our services</li>
                  <li>Send you marketing communications (with your consent)</li>
                  <li>Respond to your inquiries and support requests</li>
                </ul>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">3. Data Protection</h2>
                <p className="text-foreground/70">
                  We implement appropriate technical and organizational measures to protect your personal data 
                  against unauthorized access, alteration, disclosure, or destruction. Your data is stored 
                  securely and access is limited to authorized personnel only.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">4. Contact Us</h2>
                <p className="text-foreground/70">
                  If you have any questions about this Privacy Policy, please contact us at:
                </p>
                <p className="text-iskra-emerald font-medium">
                  arseny@iskra.ae
                </p>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
};

export default Privacy;