
'use client';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, writeBatch, serverTimestamp, getDoc, collection, query, where, getDocs, Timestamp, DocumentData, increment, deleteDoc } from 'firebase/firestore';
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

    // --- Attack Queue Logic ---
    try {
        const attackQuery = query(collection(db, 'attackQueue'), where('attackerId', '==', uid));
        const attackSnapshot = await getDocs(attackQuery);
        const completedAttacks = attackSnapshot.docs.filter(doc => doc.data().arrivalTime.toDate() <= now.toDate());

        for (const attackDoc of completedAttacks) {
            const attackData = attackDoc.data();
            const defenderRef = doc(db, 'users', attackData.defenderId);
            const defenderSnap = await getDoc(defenderRef);

            if (!defenderSnap.exists()) {
                // Target doesn't exist, return troops
                const unitReturns: { [key: string]: any } = {};
                for (const unit in attackData.units) {
                    unitReturns[`units.${unit}`] = increment(attackData.units[unit]);
                }
                batch.update(userDocRef, unitReturns);
                batch.delete(attackDoc.ref);
                continue;
            }

            const defenderProfile = defenderSnap.data() as UserProfile;
            const attackerProfile = profile; // Use the profile passed into the function

            // Fetch title and building bonuses
            const titlesSnapshot = await getDocs(collection(db, 'titles'));
            const titles = titlesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

            const getBonus = (user: UserProfile, type: 'attack' | 'defense' | 'resource') => {
                const title = [...titles].reverse().find(t => (user.pride ?? 0) >= (t as any).prideRequired);
                return title ? (title as any)[`${type}Bonus`] ?? 0 : 0;
            };

            const attackerTitleBonus = getBonus(attackerProfile, 'attack');
            const defenderTitleBonus = getBonus(defenderProfile, 'defense');

            const buildingEffectsSnap = await getDoc(doc(db, 'game-settings', 'building-effects'));
            const fortDefenseBonusPerBuilding = buildingEffectsSnap.exists() ? buildingEffectsSnap.data().fort?.defenseBonus ?? 0 : 0;
            const defenderFortBonus = (defenderProfile.buildings?.fort ?? 0) * fortDefenseBonusPerBuilding;

            // Calculate total power
            const attackerPower = (attackData.units.attack || 0) * 10 * (1 + attackerTitleBonus / 100) + 
                                  (attackData.units.elite || 0) * 13 * (1 + attackerTitleBonus / 100);

            const defenderPower = (defenderProfile.units.defense || 0) * 10 * (1 + (defenderTitleBonus + defenderFortBonus) / 100) +
                                  (defenderProfile.units.elite || 0) * 5 * (1 + (defenderTitleBonus + defenderFortBonus) / 100);

            const powerRatio = attackerPower / (defenderPower || 1); // Avoid division by zero

            let outcomeForAttacker: 'win' | 'loss';
            let attackerLossPercent = 0;
            let defenderLossPercent = 0;

            if (powerRatio > 1.2) { // Decisive win
                outcomeForAttacker = 'win';
                attackerLossPercent = 0.1;
                defenderLossPercent = 0.7;
            } else if (powerRatio > 1) { // Narrow win
                outcomeForAttacker = 'win';
                attackerLossPercent = 0.3;
                defenderLossPercent = 0.5;
            } else if (powerRatio > 0.8) { // Draw / Pyrrhic victory
                outcomeForAttacker = 'loss'; // Technically a loss as attacker
                attackerLossPercent = 0.6;
                defenderLossPercent = 0.6;
            } else { // Loss
                outcomeForAttacker = 'loss';
                attackerLossPercent = 0.9;
                defenderLossPercent = 0.2;
            }
            
            // Calculate losses
            const unitsLostAttacker: Record<string, number> = {};
            const survivingAttackers: Record<string, number> = {};
            for (const unit in attackData.units) {
                const lost = Math.floor(attackData.units[unit] * attackerLossPercent);
                unitsLostAttacker[unit] = lost;
                survivingAttackers[unit] = attackData.units[unit] - lost;
            }

            const unitsLostDefender: Record<string, number> = {};
            for (const unit in defenderProfile.units) {
                const u = unit as keyof UnitCounts;
                const lost = Math.floor((defenderProfile.units[u] ?? 0) * defenderLossPercent);
                unitsLostDefender[u] = lost;
                batch.update(defenderRef, { [`units.${u}`]: increment(-lost) });
            }
            
            // Return surviving troops to attacker
            const survivingUpdates: { [key: string]: any } = {};
            for (const unit in survivingAttackers) {
                if (survivingAttackers[unit] > 0) {
                    survivingUpdates[`units.${unit}`] = increment(survivingAttackers[unit]);
                }
            }
            batch.update(userDocRef, survivingUpdates);

            // Calculate plunder
            const resourcesPlundered = { money: 0, food: 0 };
            if (outcomeForAttacker === 'win') {
                const plunderCapacity = (attackData.units.raider || 0) * 100; // Example capacity
                const moneyPlundered = Math.min(defenderProfile.money * 0.1, plunderCapacity / 2);
                const foodPlundered = Math.min(defenderProfile.food * 0.1, plunderCapacity / 2);
                
                resourcesPlundered.money = Math.floor(moneyPlundered);
                resourcesPlundered.food = Math.floor(foodPlundered);

                batch.update(defenderRef, { 
                    money: increment(-resourcesPlundered.money),
                    food: increment(-resourcesPlundered.food)
                });
                batch.update(userDocRef, { 
                    money: increment(resourcesPlundered.money),
                    food: increment(resourcesPlundered.food)
                });
            }

            // Create report
            const reportRef = doc(collection(db, 'reports'));
            batch.set(reportRef, {
                involvedUsers: [attackerProfile.uid, defenderProfile.uid],
                attackerId: attackerProfile.uid,
                defenderId: defenderProfile.uid,
                attackerName: attackerProfile.prideName,
                defenderName: defenderProfile.prideName,
                outcomeForAttacker: outcomeForAttacker,
                unitsLostAttacker,
                unitsLostDefender,
                resourcesPlundered,
                timestamp: serverTimestamp(),
                readBy: { [attackerProfile.uid]: false, [defenderProfile.uid]: false }
            });

            batch.delete(attackDoc.ref);
            hasUpdate = true;
        }

    } catch (error) {
        console.error("Error processing attack queue:", error);
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
    const unsubscribeFromAuth = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUser(authUser);
      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        backgroundTasksProcessed.current = false;
        const isProtectedRoute = pathname.startsWith('/admindashboard') || pathname.startsWith('/userdashboard');
        if (isProtectedRoute) {
          router.push('/login');
        }
      }
    });

    return () => unsubscribeFromAuth();
  }, [router, pathname]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let unsubscribeFromSnapshot: (() => void) | undefined;

    const setupUserSession = async () => {
      setLoading(true);
      const userDocRef = doc(db, 'users', user.uid);

      try {
        // Step 1: Perform a one-time read to get the initial state for background processing.
        const initialDocSnap = await getDoc(userDocRef);

        if (initialDocSnap.exists()) {
          const initialProfile = { uid: initialDocSnap.id, ...initialDocSnap.data() } as UserProfile;

          // Check if user is disabled.
          if (initialProfile.status === 'disabled') {
            await signOut(auth);
            return; // Stop further processing
          }

          // Step 2: Run background tasks only ONCE per session.
          if (!backgroundTasksProcessed.current) {
            if (initialProfile.role === 'user') {
              await processBackgroundTasksForUser(user.uid, initialProfile);
            }
            backgroundTasksProcessed.current = true;
          }

          // Step 3: Now, set up the real-time listener for UI updates only.
          // This listener will NOT trigger background tasks.
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
              signOut(auth); // User doc was deleted.
            }
            setLoading(false);
          }, (error) => {
            console.error("Firestore snapshot error:", error);
            signOut(auth);
            setLoading(false);
          });

        } else {
          // User exists in Auth, but not in Firestore.
          await signOut(auth);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error setting up user session:", error);
        await signOut(auth);
        setLoading(false);
      }
    };

    setupUserSession();

    // Cleanup function for the real-time listener.
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
