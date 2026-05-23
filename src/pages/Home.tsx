import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Film, Headphones, Brain, TrendingUp, BookOpen, Newspaper, Sparkles, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InstallButton } from '@/components/pwa/InstallButton';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { AccountButton } from '@/components/auth/AccountButton';

const Home = () => {
  useEffect(() => {
    document.title = 'Language Learning Player';
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
            <Film className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="truncate">Language Learning Player</span>
          </h1>
          <div className="flex items-center gap-2">
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button variant="ghost" size="icon" aria-label="Settings">
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 flex flex-col gap-8 justify-center">
        <PWAInstallBanner />

        <div className="text-center space-y-2">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Choose your mode</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Watch a video or listen to a podcast — pick where you want to learn today.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/videos"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Film className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Watch & learn</p>
              <p className="text-2xl font-semibold mt-1">Videos</p>
              <p className="text-sm text-muted-foreground mt-1">
                Movies, episodes, clips — with subtitles and AI analysis
              </p>
            </div>
          </Link>

          <Link
            to="/audio"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Headphones className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Listen & learn</p>
              <p className="text-2xl font-semibold mt-1">Podcasts</p>
              <p className="text-sm text-muted-foreground mt-1">
                MP3, M4A, WAV — perfect for commutes and walks
              </p>
            </div>
          </Link>

          <Link
            to="/books"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <BookOpen className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Read & learn</p>
              <p className="text-2xl font-semibold mt-1">Books</p>
              <p className="text-sm text-muted-foreground mt-1">
                EPUB books with tap-to-translate, AI paragraph analysis & natural-voice narration
              </p>
            </div>
          </Link>

          <Link
            to="/news"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Newspaper className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Stay informed</p>
              <p className="text-2xl font-semibold mt-1">News</p>
              <p className="text-sm text-muted-foreground mt-1">
                فیدهای RSS، جستجوی موضوعی، و خلاصه‌های هوش مصنوعی — با همان متن‌خوان کتاب
              </p>
            </div>
          </Link>

          <Link
            to="/language-books"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Learn vocabulary in context</p>
              <p className="text-2xl font-semibold mt-1">Language Books</p>
              <p className="text-sm text-muted-foreground mt-1">
                لغات، فریزها و idiomها را به AI بده — یک داستان کوتاه می‌سازد و آن‌ها را مثل فصل کتاب با هایلایت می‌خوانی
              </p>
            </div>
          </Link>

          <Link
            to="/sentence-lab"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all min-h-[180px] flex flex-col justify-between"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <Mic className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Speak & practice</p>
              <p className="text-2xl font-semibold mt-1">Sentence Lab</p>
              <p className="text-sm text-muted-foreground mt-1">
                تمرین روزانه جملات با FSRS، حالت پادکست هندزفری و شبیه‌ساز مکالمه صوتی با AI
              </p>
            </div>
          </Link>

          <Link
            to="/leitner"
            className="group relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/25 via-primary/5 to-card p-6 sm:p-8 hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all min-h-[180px] flex flex-col justify-between sm:col-span-2"
          >
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/20 transition-colors" aria-hidden="true" />
            <div className="h-14 w-14 rounded-xl bg-primary/25 text-primary flex items-center justify-center group-hover:scale-110 transition-transform relative">
              <Brain className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="relative">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Spaced repetition</p>
              <p className="text-2xl font-semibold mt-1">Leitner Flashcards</p>
              <p className="text-sm text-muted-foreground mt-1">
                مرور لغات با جعبه‌های فاصله‌ای، تولید عکس و جمله نمونه با AI، صدای واقعی از منبع، و فولدر مجزا برای هر کتاب/فیلم
              </p>
            </div>
          </Link>
        </section>

        <div className="flex justify-center gap-2 flex-wrap">
          <Link to="/stats">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              Your progress
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Home;
