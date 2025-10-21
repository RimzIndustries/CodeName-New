
'use client';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, writeBatch, serverTimestamp, getDoc, collection, query, where, getDocs, Timestamp, DocumentData, increment, deleteDoc, setDoc } from 'firebase/firestore';
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
  spy: number;
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
                    
                    const hourlyMoneyBonus = bonusData.money ?? 0;
                    const hourlyFoodBonus = bonusData.food ?? 0;
                    
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
                    
                    const updates: DocumentData = {};
                    if(totalMoneyBonus > 0) updates.money = increment(totalMoneyBonus);
                    if(totalFoodBonus > 0) updates.food = increment(totalFoodBonus);
                    if(totalUnemployedBonus > 0) updates.unemployed = increment(totalUnemployedBonus);
                    
                    if (Object.keys(updates).length > 0) {
                       batch.update(userDocRef, updates);
                       hasUpdate = true;
                    }
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
        
        const completedConstruction = constructionSnapshot.docs.filter(doc => doc.data().completionTime.toDate() <= now.toDate());
        if (completedConstruction.length > 0) {
            const buildingUpdates: { [key: string]: any } = {};
            completedConstruction.forEach(doc => {
                const job = doc.data();
                buildingUpdates[`buildings.${job.buildingId}`] = increment(job.amount);
                batch.delete(doc.ref);
            });
            batch.update(userDocRef, buildingUpdates);
            hasUpdate = true;
        }

        const completedTraining = trainingSnapshot.docs.filter(doc => doc.data().completionTime.toDate() <= now.toDate());
        if (completedTraining.length > 0) {
            const unitUpdates: { [key: string]: any } = {};
            completedTraining.forEach(doc => {
              const job = doc.data();
              unitUpdates[`units.${job.unitId}`] = increment(job.amount);
              batch.delete(doc.ref);
            });
            if(Object.keys(unitUpdates).length > 0) {
              batch.update(userDocRef, unitUpdates);
              hasUpdate = true;
            }
        }
    } catch (error) {
        console.error("Error processing queues:", error);
    }

    // --- Mission Queue Logic (Attack & Spy) ---
    try {
        const missionQuery = query(collection(db, 'attackQueue'), where('attackerId', '==', uid));
        const missionSnapshot = await getDocs(missionQuery);
        const completedMissions = missionSnapshot.docs.filter(doc => doc.data().arrivalTime.toDate() <= now.toDate());

        for (const missionDoc of completedMissions) {
            const missionData = missionDoc.data();
            const defenderRef = doc(db, 'users', missionData.defenderId);
            const defenderSnap = await getDoc(defenderRef);

            if (!defenderSnap.exists()) {
                const unitReturns: { [key: string]: any } = {};
                for (const unit in missionData.units) {
                    unitReturns[`units.${unit}`] = increment(missionData.units[unit]);
                }
                batch.update(userDocRef, unitReturns);
                batch.delete(missionDoc.ref);
                continue;
            }

            const defenderProfile = defenderSnap.data() as UserProfile;
            const attackerProfile = profile; 

            // --- SPY MISSION ---
            if (missionData.type === 'spy') {
                const totalSpies = missionData.units.spy || 0;
                const defenderTotalDefenseTroops = defenderProfile.units.defense || 0;
                // Success chance decreases as defender has more defense troops.
                const successChance = Math.max(0.05, (totalSpies * 2) / (defenderTotalDefenseTroops || 1));
                const isSuccess = Math.random() < successChance;
                
                const reportRef = doc(collection(db, 'reports'));
                const reportPayload: any = {
                    type: 'spy',
                    involvedUsers: [attackerProfile.uid, defenderProfile.uid],
                    attackerId: attackerProfile.uid,
                    defenderId: defenderProfile.uid,
                    attackerName: attackerProfile.prideName,
                    defenderName: defenderProfile.prideName,
                    timestamp: serverTimestamp(),
                    readBy: { [attackerProfile.uid]: false, [defenderProfile.uid]: false }
                };

                if (isSuccess) {
                    reportPayload.outcomeForAttacker = 'success';
                    reportPayload.intel = {
                        money: defenderProfile.money,
                        food: defenderProfile.food,
                        land: defenderProfile.land,
                        units: defenderProfile.units,
                        buildings: defenderProfile.buildings
                    };
                    // Spies return home
                    const survivingUpdates: { [key: string]: any } = {};
                    survivingUpdates['units.spy'] = increment(totalSpies);
                    batch.update(userDocRef, survivingUpdates);
                } else {
                    reportPayload.outcomeForAttacker = 'failure';
                    // Spies are lost, but defender is notified
                    const defenderReportRef = doc(collection(db, 'reports'));
                     batch.set(defenderReportRef, {
                        type: 'spy',
                        involvedUsers: [defenderProfile.uid],
                        attackerId: null, // Attacker is unknown to defender
                        defenderId: defenderProfile.uid,
                        attackerName: 'Mata-mata Asing',
                        defenderName: defenderProfile.prideName,
                        outcomeForAttacker: 'failure', // From defender's POV, it's a defense success
                        timestamp: serverTimestamp(),
                        readBy: { [defenderProfile.uid]: false }
                    });
                }
                batch.set(reportRef, reportPayload);

            // --- ATTACK MISSION ---
            } else if (missionData.type === 'attack') {
                batch.update(userDocRef, { [`lastAttackOn.${missionData.defenderId}`]: serverTimestamp() });
                const titlesSnapshot = await getDocs(collection(db, 'titles'));
                const titles = titlesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

                const getBonus = (user: UserProfile, type: 'attack' | 'defense' | 'resource') => {
                    const title = [...titles].reverse().find(t => (user.pride ?? 0) >= (t as any).prideRequired);
                    return title ? (title as any)[`${type}Bonus`] ?? 0 : 0;
                };

                const attackerTitleBonus = getBonus(attackerProfile, 'attack');
                const defenderTitleBonus = getBonus(defenderProfile, 'defense');

                const buildingEffectsSnap = await getDoc(doc(db, 'game-settings', 'building-effects'));
                const fortDefenseBonusPerBuilding = buildingEffectsSnap.exists() ? buildingEffectsSnap.data()?.fort?.defenseBonus ?? 0 : 0;
                const mobilityAttackBonusPerBuilding = buildingEffectsSnap.exists() ? buildingEffectsSnap.data()?.mobility?.attackBonus ?? 0 : 0;

                const attackerMobilityBonus = (attackerProfile.buildings?.mobility ?? 0) * mobilityAttackBonusPerBuilding;
                const defenderFortBonus = (defenderProfile.buildings?.fort ?? 0) * fortDefenseBonusPerBuilding;
                
                const totalAttackerBonus = attackerTitleBonus + attackerMobilityBonus;
                const totalDefenderBonus = defenderTitleBonus + defenderFortBonus;

                const attackerPower = (missionData.units.attack || 0) * 10 * (1 + totalAttackerBonus / 100) + 
                                      (missionData.units.elite || 0) * 13 * (1 + totalAttackerBonus / 100);

                const defenderPower = (defenderProfile.units.defense || 0) * 10 * (1 + totalDefenderBonus / 100) +
                                      (defenderProfile.units.elite || 0) * 5 * (1 + totalDefenderBonus / 100);

                const powerRatio = attackerPower / (defenderPower || 1);

                let outcomeForAttacker: 'win' | 'loss';
                let attackerLossPercent = 0;
                let defenderLossPercent = 0;

                if (powerRatio > 1.2) {
                    outcomeForAttacker = 'win';
                    attackerLossPercent = 0.1;
                    defenderLossPercent = 0.7;
                } else if (powerRatio > 1) {
                    outcomeForAttacker = 'win';
                    attackerLossPercent = 0.3;
                    defenderLossPercent = 0.5;
                } else if (powerRatio > 0.8) { 
                    outcomeForAttacker = 'loss'; 
                    attackerLossPercent = 0.6;
                    defenderLossPercent = 0.6;
                } else {
                    outcomeForAttacker = 'loss';
                    attackerLossPercent = 0.9;
                    defenderLossPercent = 0.2;
                }
                
                const unitsLostAttacker: Record<string, number> = {};
                const survivingAttackers: Record<string, number> = {};
                for (const unit in missionData.units) {
                    const lost = Math.floor(missionData.units[unit] * attackerLossPercent);
                    unitsLostAttacker[unit] = lost;
                    survivingAttackers[unit] = missionData.units[unit] - lost;
                }

                const unitsLostDefender: Record<string, number> = {};
                const defenderUpdates: { [key: string]: any } = {};
                for (const unit in defenderProfile.units) {
                    const u = unit as keyof UnitCounts;
                    const lost = Math.floor((defenderProfile.units[u] ?? 0) * defenderLossPercent);
                    unitsLostDefender[u] = lost;
                    if (lost > 0) {
                        defenderUpdates[`units.${u}`] = increment(-lost);
                    }
                }
                if (Object.keys(defenderUpdates).length > 0) {
                    batch.update(defenderRef, defenderUpdates);
                }
                
                const survivingUpdates: { [key: string]: any } = {};
                for (const unit in survivingAttackers) {
                    if (survivingAttackers[unit] > 0) {
                        survivingUpdates[`units.${unit}`] = increment(survivingAttackers[unit]);
                    }
                }
                if(Object.keys(survivingUpdates).length > 0) {
                  batch.update(userDocRef, survivingUpdates);
                }

                const resourcesPlundered = { money: 0, food: 0 };
                if (outcomeForAttacker === 'win') {
                    const plunderCapacity = (missionData.units.raider || 0) * 100;
                    const moneyPlundered = Math.min(defenderProfile.money * 0.1, plunderCapacity / 2);
                    const foodPlundered = Math.min(defenderProfile.food * 0.1, plunderCapacity / 2);
                    
                    resourcesPlundered.money = Math.floor(moneyPlundered);
                    resourcesPlundered.food = Math.floor(foodPlundered);

                    if (resourcesPlundered.money > 0 || resourcesPlundered.food > 0) {
                        batch.update(defenderRef, { 
                            money: increment(-resourcesPlundered.money),
                            food: increment(-resourcesPlundered.food)
                        });
                        batch.update(userDocRef, { 
                            money: increment(resourcesPlundered.money),
                            food: increment(resourcesPlundered.food)
                        });
                    }
                }

                const reportRef = doc(collection(db, 'reports'));
                batch.set(reportRef, {
                    type: 'attack',
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
            }

            batch.delete(missionDoc.ref);
            hasUpdate = true;
        }

    } catch (error) {
        console.error("Error processing mission queue:", error);
    }

    // --- Expired Wars Logic ---
    try {
        const expiredWarsQuery = query(collection(db, "wars"), where("expiresAt", "<=", now));
        const expiredWarsSnapshot = await getDocs(expiredWarsQuery);
        if (!expiredWarsSnapshot.empty) {
            expiredWarsSnapshot.forEach(warDoc => {
                batch.delete(warDoc.ref);
            });
            hasUpdate = true;
        }
    } catch (error) {
        console.error("Error processing expired wars:", error);
    }
    
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
        if (!backgroundTasksProcessed.current) {
          const initialDocSnap = await getDoc(userDocRef);
          if (initialDocSnap.exists()) {
            const initialProfile = { uid: initialDocSnap.id, ...initialDocSnap.data() } as UserProfile;
            if (initialProfile.role === 'user') {
              await processBackgroundTasksForUser(user.uid, initialProfile);
            }
          }
          backgroundTasksProcessed.current = true;
        }
        
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
            signOut(auth);
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore snapshot error:", error);
          signOut(auth);
          setLoading(false);
        });

      } catch (error) {
        console.error("Error setting up user session:", error);
        await signOut(auth);
        setLoading(false);
      }
    };

    setupUserSession();

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
