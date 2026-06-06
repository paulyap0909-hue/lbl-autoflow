import React, { useState } from 'react';

export type UserRole = 'admin' | 'sales';

export type CurrentUser = {
  email: string;
  role: UserRole;
};

type LoginPageProps = {
  onLogin: (user: CurrentUser) => void;
};

const accounts: Array<CurrentUser & { password: string }> = [
  { email: 'paulyap0909@gmail.com', password: 'admin123', role: 'admin' },
  { email: 'layerbylayermy@gmail.com', password: 'sales123', role: 'sales' }
];

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = accounts.find(
      (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
    );

    if (!account) {
      setError('Invalid email or password.');
      return;
    }

    const user: CurrentUser = { email: account.email, role: account.role };
    localStorage.setItem('lbl_currentUser', JSON.stringify(user));
    onLogin(user);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-charcoal via-[#080808] to-[#15120d] px-4 py-8 text-cream">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[36px] border border-white/10 bg-[#0d0d0d] shadow-2xl lg:grid-cols-[1fr_460px]">
          <section className="hidden min-h-[620px] flex-col justify-between border-r border-white/10 bg-[#111111] p-10 lg:flex">
            <div>
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-gold text-xl font-semibold text-charcoal shadow-panel">
                LBL
              </div>
              <p className="mt-8 text-xs uppercase tracking-[0.35em] text-softGold">AutoFlow Secure Access</p>
              <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-tight text-white">
                Layer By Layer operations, protected for testing.
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-400">
                Temporary local login for pre-production testing. Replace with Supabase Auth before full production launch.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['Orders', 'Kitchen', 'Delivery'].map((item) => (
                <div key={item} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-softGold">{item}</p>
                  <p className="mt-2 text-sm text-slate-300">Role protected</p>
                </div>
              ))}
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <div className="mb-8 lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gold text-lg font-semibold text-charcoal shadow-panel">
                LBL
              </div>
              <p className="mt-5 text-xs uppercase tracking-[0.28em] text-softGold">AutoFlow</p>
            </div>

            <p className="text-xs uppercase tracking-[0.28em] text-softGold">Login</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Welcome back</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Sign in to continue to the LBL AutoFlow dashboard.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block text-sm text-slate-300">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                  }}
                  className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#141414] px-4 py-3 text-white outline-none transition focus:border-gold/60"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError('');
                  }}
                  className="mt-3 w-full rounded-[24px] border border-white/10 bg-[#141414] px-4 py-3 text-white outline-none transition focus:border-gold/60"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </label>

              {error && (
                <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-[24px] bg-gold px-5 py-3 text-sm font-semibold text-charcoal transition hover:bg-softGold"
              >
                Login
              </button>
            </form>

            <div className="mt-8 rounded-[24px] border border-white/10 bg-[#141414] p-4 text-xs leading-6 text-slate-400">
              <p className="font-semibold text-softGold">Testing accounts</p>
              <p className="mt-2">Admin: paulyap0909@gmail.com</p>
              <p>Sales: layerbylayermy@gmail.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
