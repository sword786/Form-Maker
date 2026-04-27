import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

export function Layout() {
  const { user, signIn, logOut, loading } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-gray-900 tracking-tight">AI Feedback Forms</span>
            </Link>
            <div className="flex items-center space-x-4">
              {!loading && (
                user ? (
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">{user.email}</span>
                    <Button variant="outline" size="sm" onClick={logOut}>Log out</Button>
                  </div>
                ) : (
                  <Button onClick={signIn}>Sign in with Google</Button>
                )
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
