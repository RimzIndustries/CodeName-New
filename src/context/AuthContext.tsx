
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

async function processBackgroundTasksForUser(uid: string, profile: UserProfile) {
    if (!profile || profile.role !== 'user') return;

    const userDocRef = doc(db, 'users', uid);
    const now = Timestamp.now();
    const batch = writeBatch(db);
    let hasUpdate = false;

    // --- Hourly Bonus Logic ---
    if (profile.lastResourceUpdate) {
        const lastUpdate = (profile.lastResourceUpdate as Timestamp).toDate();
        const diffInMs = now.toMillis() - lastUpdate.getTime();
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInHours > 0) {
            try {
                const bonusesDocRef = doc(db, 'game-settings', 'global-bonuses');
                const buildingEffectsRef = doc(db, 'game-settings', 'building-effects');
                
                const [bonusesDocSnap, buildingEffectsSnap] = await Promise.all([
                    getDoc(bonusesDocRef),
                    getDoc(buildingEffectsRef)
                ]);

                if (bonusesDocSnap.exists() && buildingEffectsSnap.exists()) {
                    const bonusData = bonusesDocSnap.data();
                    const effectsData = buildingEffectsSnap.data();

                    const hourlyMoneyBonus = bonusData.money ?? 100;
                    const hourlyFoodBonus = bonusData.food ?? 10;
                    
                    const moneyFromTambang = (profile.buildings?.tambang ?? 0) * (effectsData.tambang?.money ?? 0);
                    const foodFromFarm = (profile.buildings?.farm ?? 0) * (effectsData.farm?.food ?? 0);
                    
                    let unemployedFromBuildings = 0;
                    if (profile.buildings && effectsData) {
                        for (const buildingKey in profile.buildings) {
                            const buildingCount = profile.buildings[buildingKey as keyof BuildingCounts] || 0;
                            const buildingEffect = effectsData[buildingKey as keyof BuildingCounts];
                            if (buildingEffect && buildingEffect.unemployed) {
                                unemployedFromBuildings += buildingCount * buildingEffect.unemployed;
                            }
                        }
                    }

                    const totalMoneyBonus = (hourlyMoneyBonus + moneyFromTambang) * diffInHours;
                    const totalFoodBonus = (hourlyFoodBonus + foodFromFarm) * diffInHours;
                    const totalUnemployedBonus = unemployedFromBuildings * diffInHours;
                    
                    if(totalMoneyBonus > 0) batch.update(userDocRef, { money: increment(totalMoneyBonus) });
                    if(totalFoodBonus > 0) batch.update(userDocRef, { food: increment(totalFoodBonus) });
                    if(totalUnemployedBonus > 0) batch.update(userDocRef, { unemployed: increment(totalUnemployedBonus) });
                    
                    hasUpdate = true;
                }
            } catch (error) {
                console.error("Failed to calculate hourly bonus:", error);
            }
        }
    }
    
    // --- Construction & Training Queue Logic ---
    try {
        const constructionQuery = query(collection(db, 'constructionQueue'), where('userId', '==', uid));
        const trainingQuery = query(collection(db, 'trainingQueue'), where('userId', '==', uid));
        
        const [constructionSnapshot, trainingSnapshot] = await Promise.all([getDocs(constructionQuery), getDocs(trainingQuery)]);

        const now_date = now.toDate();
        
        const completedConstructionJobs = constructionSnapshot.docs.filter(d => d.data().completionTime.toDate() <= now_date);
        const completedTrainingJobs = trainingSnapshot.docs.filter(d => d.data().completionTime.toDate() <= now_date);


        if (completedConstructionJobs.length > 0) {
            const buildingUpdates: { [key: string]: any } = {};
            completedConstructionJobs.forEach(doc => {
                const job = doc.data();
                buildingUpdates[`buildings.${job.buildingId}`] = increment(job.amount);
                batch.delete(doc.ref);
            });
            batch.update(userDocRef, buildingUpdates);
            hasUpdate = true;
        }

        if (completedTrainingJobs.length > 0) {
            const unitUpdates: { [key: string]: any } = {};
            completedTrainingJobs.forEach(doc => {
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
    
    // Always update the lastResourceUpdate timestamp to prevent re-running tasks on every load.
    batch.update(userDocRef, { lastResourceUpdate: serverTimestamp() });
    hasUpdate = true;

    if (hasUpdate) {
        try {
            await batch.commit();
        } catch (error) {
            console.error("Failed to commit background task batch:", error);
        }
    }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const backgroundTasksProcessed = useRef(false);

  useEffect(() => {
    const unsubscribeFromAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setUserProfile(null);
        setLoading(false);
        backgroundTasksProcessed.current = false; // Reset on logout
        const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
        if (isProtectedRoute) {
          router.push('/login');
        }
      }
      // The rest of the logic is now handled in the next useEffect
    });

    return () => unsubscribeFromAuth();
  }, [router, pathname]);

  useEffect(() => {
    if (!user) return;

    let unsubscribeFromSnapshot: (() => void) | undefined;
    
    const setupListenerAndTasks = async () => {
      setLoading(true);
      const userDocRef = doc(db, 'users', user.uid);

      // --- One-time background processing ---
      if (!backgroundTasksProcessed.current) {
        try {
          const initialDocSnap = await getDoc(userDocRef);
          if (initialDocSnap.exists()) {
            const initialProfile = { uid: initialDocSnap.id, ...initialDocSnap.data() } as UserProfile;
            if (initialProfile.status !== 'disabled') {
              if (initialProfile.role === 'user') {
                await processBackgroundTasksForUser(user.uid, initialProfile);
              }
              backgroundTasksProcessed.current = true;
            } else {
              // If user is disabled, sign out and stop.
              signOut(auth);
              return;
            }
          }
        } catch (error) {
          console.error("Error during initial background processing:", error);
        }
      }

      // --- Real-time listener for UI updates ---
      unsubscribeFromSnapshot = onSnapshot(userDocRef, (userDoc) => {
        if (userDoc.exists()) {
          const profileData = { uid: userDoc.id, ...userDoc.data() } as UserProfile;
          
          if (profileData.status === 'disabled') {
            signOut(auth);
            return;
          }
          
          setUserProfile(profileData);

          const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
          if (isAuthPage) {
             if (profileData.role === 'admin') {
                router.push('/admindashboard');
             } else {
                router.push('/userdashboard');
             }
          }
        } else {
          // User document deleted while logged in.
          signOut(auth);
        }
        setLoading(false);
      }, (error) => {
        console.error("Firestore snapshot error:", error);
        signOut(auth);
        setLoading(false);
      });
    };

    setupListenerAndTasks();

    return () => {
      if (unsubscribeFromSnapshot) {
        unsubscribeFromSnapshot();
      }
    };
  }, [user, router, pathname]);

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
