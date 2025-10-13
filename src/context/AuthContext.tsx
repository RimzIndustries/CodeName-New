
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
  
  // New useEffect for handling background tasks like resource updates and queue processing
  useEffect(() => {
    if (!userProfile || userProfile.role !== 'user') return;

    const processBackgroundTasks = async () => {
        const userDocRef = doc(db, 'users', userProfile.uid);
        let batch = writeBatch(db);
        let hasUpdate = false;

        // --- Hourly Bonus Logic ---
        if (userProfile.lastResourceUpdate) {
            const now = Timestamp.now();
            const lastUpdate = (userProfile.lastResourceUpdate as Timestamp).toDate();
            const diffInMs = now.toMillis() - lastUpdate.getTime();
            const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

            if (diffInHours > 0) {
                try {
                    const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
                    const bonusesDocSnap = await getDoc(bonusesDocRef);
                    const buildingEffectsRef = doc(db, 'game-settings', 'building-effects');
                    const buildingEffectsSnap = await getDoc(buildingEffectsRef);

                    if (bonusesDocSnap.exists() && buildingEffectsSnap.exists()) {
                        const bonusData = bonusesDocSnap.data();
                        const effectsData = buildingEffectsSnap.data();

                        const hourlyMoneyBonus = bonusData.money || 100;
                        const hourlyFoodBonus = bonusData.food || 10;
                        
                        const moneyFromTambang = (userProfile.buildings?.tambang || 0) * (effectsData.tambang?.money || 0);
                        const foodFromFarm = (userProfile.buildings?.farm || 0) * (effectsData.farm?.food || 0);

                        const totalMoneyBonus = (hourlyMoneyBonus + moneyFromTambang) * diffInHours;
                        const totalFoodBonus = (hourlyFoodBonus + foodFromFarm) * diffInHours;
                        
                        batch.update(userDocRef, {
                            money: increment(totalMoneyBonus),
                            food: increment(totalFoodBonus),
                            lastResourceUpdate: serverTimestamp()
                        });
                        hasUpdate = true;
                    }
                } catch (error) {
                    console.error("Failed to calculate hourly bonus:", error);
                }
            }
        }
        
        // --- Construction & Training Queue Logic ---
        try {
            const constructionQuery = query(collection(db, 'constructionQueue'), where('userId', '==', userProfile.uid), where('completionTime', '<=', Timestamp.now()));
            const trainingQuery = query(collection(db, 'trainingQueue'), where('userId', '==', userProfile.uid), where('completionTime', '<=', Timestamp.now()));
            
            const [constructionSnapshot, trainingSnapshot] = await Promise.all([getDocs(constructionQuery), getDocs(trainingQuery)]);

            if (!constructionSnapshot.empty) {
                const buildingUpdates: { [key: string]: any } = {};
                constructionSnapshot.forEach(doc => {
                    const job = doc.data();
                    buildingUpdates[`buildings.${job.buildingId}`] = increment(job.amount);
                    batch.delete(doc.ref);
                });
                batch.update(userDocRef, buildingUpdates);
                hasUpdate = true;
            }

            if (!trainingSnapshot.empty) {
                const unitUpdates: { [key: string]: any } = {};
                trainingSnapshot.forEach(doc => {
                    const job = doc.data();
                    unitUpdates[`units.${job.unitId}`] = increment(job.amount);
                    batch.delete(doc.ref);
                });
                batch.update(userDocRef, unitUpdates);
                hasUpdate = true;
            }
        } catch (error) {
            console.error("Error processing queues:", error);
        }

        if (hasUpdate) {
            try {
                await batch.commit();
            } catch (error) {
                console.error("Failed to commit background task batch:", error);
            }
        }
    };
    
    // Run tasks immediately on profile load, and then set an interval
    processBackgroundTasks(); 
    const interval = setInterval(processBackgroundTasks, 60000); // Check every minute
    return () => clearInterval(interval);

  }, [userProfile]);

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
