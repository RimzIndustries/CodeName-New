
'use client';

import { useUser } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect } from 'react';
import { Crown } from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useAuth } from '@/firebase';
import type { UserProfile as UserProfileType } from './types';
export type UserProfile = UserProfileType;


interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, userProfile, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (!authUser && !loading) {
        const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
        if (isProtectedRoute) {
          router.push('/login');
        }
      }
    });

    return () => unsubscribe();
  }, [auth, loading, pathname, router]);

  useEffect(() => {
    if (loading) return;

    if (user && userProfile) {
       if (userProfile.status === 'disabled') {
            signOut(auth);
            return;
        }

        const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
        if (isAuthPage) {
            if (userProfile.role === 'admin') {
                router.push('/admindashboard');
            } else {
                router.push('/userdashboard');
            }
        }
    } else if (!user) {
        const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
        if (isProtectedRoute) {
            router.push('/login');
        }
    }
  }, [user, userProfile, loading, pathname, router, auth]);
  

  const value = { user, userProfile, loading };

  if (loading && (pathname.startsWith('/userdashboard') || pathname.startsWith('/admindashboard'))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
            <Crown className="h-12 w-12 animate-pulse text-primary" />
            <p className="text-muted-foreground">Memuat Pride...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
