import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { BMAccessForm } from "@/components/BMAccessForm";

const BMAccess = () => {
  return (
    <>
      <Helmet>
        <title>Old Business Manager Access | ISKRA</title>
        <meta name="description" content="Apply to partner with ISKRA. Old Business Manager access program." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="py-5 border-b border-border">
        <div className="container mx-auto px-4">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">
            ISKRA
          </Link>
        </div>
      </header>

      <main>
        <BMAccessForm />
      </main>
    </>
  );
};

export default BMAccess;
