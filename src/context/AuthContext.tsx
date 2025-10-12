
'use client';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, writeBatch, serverTimestamp, getDoc, collection, query, where, getDocs, Timestamp, DocumentData, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { Crown } from 'lucide-react';

interface BuildingCounts {
  residence: number;
  farm: number;
  fort: number;
  university: number;
  barracks: number;
  mobility: number;
  tambang: number;
}

interface UnitCounts {
  attack: number;
  defense: number;
  elite: number;
  raider: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  prideName: string;
  role: 'admin' | 'user';
  status?: 'active' | 'disabled';
  money: number;
  food: number;
  land: number;
  zodiac: string;
  province: string;
  buildings: BuildingCounts;
  units: UnitCounts;
  unemployed: number;
  pride: number;
  lastResourceUpdate: any; 
  allianceId?: string | null;
  coordinates?: { x: number; y: number };
  lastAttackOn?: { [key: string]: Timestamp };
}

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
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let unsubscribeFromSnapshot: (() => void) | undefined;
    
    const unsubscribeFromAuth = onAuthStateChanged(auth, async (authUser) => {
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
      
      setLoading(true);

      if (authUser) {
        setUser(authUser);
        const userDocRef = doc(db, 'users', authUser.uid);
        
        unsubscribeFromSnapshot = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const profile = { uid: userDoc.id, ...userDoc.data() } as UserProfile;

            if (profile.status === 'disabled') {
              signOut(auth);
              return; 
            }
            
            // --- Hourly Bonus Logic ---
            if (profile.role === 'user' && profile.lastResourceUpdate) {
                const now = Timestamp.now();
                const lastUpdate = (profile.lastResourceUpdate as Timestamp).toDate();
                const diffInMs = now.toMillis() - lastUpdate.getTime();
                const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

                if (diffInHours > 0) {
                    try {
                        const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
                        const bonusesDocSnap = await getDoc(bonusesDocRef);
                        
                        if (bonusesDocSnap.exists()) {
                            const bonusData = bonusesDocSnap.data();
                            const moneyBonus = (bonusData.money || 100) * diffInHours;
                            const foodBonus = (bonusData.food || 10) * diffInHours;

                            await updateDoc(userDocRef, {
                                money: increment(moneyBonus),
                                food: increment(foodBonus),
                                lastResourceUpdate: serverTimestamp()
                            });
                        }
                    } catch (error) {
                        console.error("Failed to apply hourly bonus:", error);
                    }
                }
            }
            // --- End of Hourly Bonus Logic ---

            setUserProfile(profile);

            const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
            if (isAuthPage) {
               if (profile.role === 'admin') {
                  router.push('/admindashboard');
               } else {
                  router.push('/userdashboard');
               }
            }
          } else {
              setUserProfile(null);
              const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
              if (isProtectedRoute) {
                  router.push('/login');
              }
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore snapshot error:", error);
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          router.push('/login');
        });

      } else {
        setUser(null);
        setUserProfile(null);
        const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
        if (isProtectedRoute) {
            router.push('/login');
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeFromAuth();
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
    };
  }, [router, pathname]);
  

  const value = { user, userProfile, loading };

  if (loading) {
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
