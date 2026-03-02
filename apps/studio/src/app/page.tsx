import { NewGameButton } from '@/components/NewGameButton';
import { SessionList } from '@/components/SessionList';

/**
 * GameForge Studio landing page.
 * Presents a hero section with a "New Game" button and a list of
 * previous sessions that can be resumed.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          GameForge
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-400">
          Describe your game, watch it come to life. AI-powered 2D game creation
          with live preview.
        </p>
        <div className="mt-10">
          <NewGameButton />
        </div>
      </div>
      <div className="mt-16 w-full max-w-4xl">
        <SessionList />
      </div>
    </main>
  );
}
