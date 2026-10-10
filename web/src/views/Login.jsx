import { Music2 } from 'lucide-react';

export function Login() {
  return (
    <main className="splash">
      <div className="splash-card route-fade">
        <div className="logo"><Music2 size={30} /></div>
        <h1>Rae</h1>
        <p>Control your server's music from the browser. Log in with Discord to get started.</p>
        <a className="chip solid big" href="/auth/login">Continue with Discord</a>
      </div>
    </main>
  );
}
