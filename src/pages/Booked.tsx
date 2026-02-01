import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Sparkles, Mail, Play, Calendar } from "lucide-react";

const Booked = () => {
  return (
    <>
      <Helmet>
        <title>Звонок подтверждён | ISKRA</title>
        <meta 
          name="description" 
          content="Ваш звонок с ISKRA подтверждён. Посмотрите видео перед встречей." 
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <main className="min-h-screen bg-foreground flex flex-col">
        {/* Header */}
        <header className="py-6 border-b border-background/10">
          <div className="container mx-auto px-4">
            <Link to="/" className="flex items-center gap-2 w-fit">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-background">
                ISKRA
              </span>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-3xl">
            {/* Success Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-iskra-emerald/20 border border-iskra-emerald/30">
                <Calendar className="w-4 h-4 text-iskra-emerald" />
                <span className="text-iskra-emerald text-sm font-medium">Звонок забронирован</span>
              </div>
            </div>

            {/* Heading */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-background text-center mb-4 leading-tight">
              Отлично, до встречи!
            </h1>
            
            <p className="text-background/60 text-center text-lg mb-8 max-w-xl mx-auto">
              Осталось 2 шага, чтобы подготовиться к звонку
            </p>

            {/* Steps */}
            <div className="space-y-6 mb-10">
              {/* Step 1 */}
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-background/5 border border-background/10">
                <div className="w-10 h-10 rounded-xl bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-iskra-emerald" />
                </div>
                <div>
                  <h3 className="text-background font-semibold text-lg mb-1">
                    Подтверди встречу на почте
                  </h3>
                  <p className="text-background/50 text-sm">
                    Проверь почту и прими приглашение в календарь — так я точно буду знать, что ты придёшь
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-background/5 border border-background/10">
                <div className="w-10 h-10 rounded-xl bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 text-iskra-emerald" />
                </div>
                <div>
                  <h3 className="text-background font-semibold text-lg mb-1">
                    Посмотри короткое видео
                  </h3>
                  <p className="text-background/50 text-sm">
                    За 5 минут покажу, как это работает — чтобы на звонке сразу перейти к делу
                  </p>
                </div>
              </div>
            </div>

            {/* Loom Video Embed */}
            <div className="rounded-2xl overflow-hidden border border-background/10 shadow-2xl shadow-iskra-emerald/10">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src="https://www.loom.com/embed/2658f8d61782474ab7623445c4a10924?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true"
                  frameBorder="0"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen"
                />
              </div>
            </div>

            {/* Footer note */}
            <p className="text-background/40 text-center text-sm mt-8">
              Увидимся на звонке! Если возникнут вопросы — пиши в WhatsApp
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-6 border-t border-background/10">
          <div className="container mx-auto px-4 text-center">
            <p className="text-background/50 text-sm">
              © {new Date().getFullYear()} ISKRA. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Booked;
