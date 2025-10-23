
'use client';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, writeBatch, serverTimestamp, getDoc, collection, query, where, getDocs, Timestamp, DocumentData, increment, deleteDoc } from 'firebase/firestore';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { Crown } from 'lucide-react';
import { type GameSettings, useGameSettings } from './GameSettingsContext';

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

async function processBackgroundTasksForUser(uid: string, profile: UserProfile, gameSettings: GameSettings) {
    if (!profile || profile.role !== 'user') return;

    const userDocRef = doc(db, 'users', uid);
    const now = Timestamp.now();
    const batch = writeBatch(db);
    let hasUpdate = false;

    // --- Fetch Game Titles ---
    const titlesRef = collection(db, 'titles');
    const titlesSnapshot = await getDocs(titlesRef);
    const titles = titlesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));


    // --- Hourly Bonus Logic ---
    if (profile.lastResourceUpdate) {
        const lastUpdate = (profile.lastResourceUpdate as Timestamp).toDate();
        const diffInMs = now.toMillis() - lastUpdate.getTime();
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

        if (diffInHours > 0) {
            const hourlyMoneyBonus = gameSettings.globalBonuses.money ?? 0;
            const hourlyFoodBonus = gameSettings.globalBonuses.food ?? 0;
            
            const moneyFromTambang = (profile.buildings?.tambang ?? 0) * (gameSettings.effects.tambang?.money ?? 0);
            const foodFromFarm = (profile.buildings?.farm ?? 0) * (gameSettings.effects.farm?.food ?? 0);
            
            let unemployedFromBuildings = 0;
            if (profile.buildings && gameSettings.effects) {
                for (const buildingKey in profile.buildings) {
                    const buildingCount = profile.buildings[buildingKey as keyof BuildingCounts] || 0;
                    const buildingEffect = gameSettings.effects[buildingKey as keyof BuildingCounts];
                    if (buildingEffect && (buildingEffect as any).unemployed) {
                        unemployedFromBuildings += buildingCount * (buildingEffect as any).unemployed;
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
    }
    
    // --- Construction & Training Queue Logic ---
    try {
        const constructionQuery = query(collection(db, 'constructionQueue'), where('userId', '==', uid));
        const trainingQuery = query(collection(db, 'trainingQueue'), where('userId', '==', uid));
        
        const [constructionSnapshot, trainingSnapshot] = await Promise.all([getDocs(constructionQuery), getDocs(trainingQuery)]);
        
        const completedConstructions = constructionSnapshot.docs.filter(doc => doc.data().completionTime.toDate() <= now.toDate());
        if (completedConstructions.length > 0) {
            const buildingUpdates: { [key: string]: any } = {};
            completedConstructions.forEach(doc => {
                const job = doc.data();
                buildingUpdates[`buildings.${job.buildingId}`] = increment(job.amount);
                batch.delete(doc.ref);
            });
            batch.update(userDocRef, buildingUpdates);
            hasUpdate = true;
        }

        const completedTrainings = trainingSnapshot.docs.filter(doc => doc.data().completionTime.toDate() <= now.toDate());
        if (completedTrainings.length > 0) {
            const unitUpdates: { [key: string]: any } = {};
            completedTrainings.forEach(doc => {
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

    // --- Mission Queue Logic (Attack & Spy) ---
    try {
        const missionQuery = query(collection(db, 'attackQueue'), where('attackerId', '==', uid));
        const missionSnapshot = await getDocs(missionQuery);
        
        const missionsToProcess = missionSnapshot.docs.filter(doc => doc.data().arrivalTime.toDate() <= now.toDate());

        for (const missionDoc of missionsToProcess) {
            const missionData = missionDoc.data();
            const missionType = missionData.type || 'attack'; // Default to 'attack' if type is missing

            const defenderRef = doc(db, 'users', missionData.defenderId);
            const defenderSnap = await getDoc(defenderRef);

            if (!defenderSnap.exists()) {
                // Target doesn't exist, return troops
                const unitReturns: { [key: string]: any } = {};
                for (const unit in missionData.units) {
                    unitReturns[`units.${unit}`] = increment(missionData.units[unit]);
                }
                batch.update(userDocRef, unitReturns);
                batch.delete(missionDoc.ref);
                hasUpdate = true;
                continue; // Skip to next mission
            }

            const defenderProfile = defenderSnap.data() as UserProfile;
            const attackerProfile = profile; // We already have this

            if (missionType === 'attack') {
                batch.update(userDocRef, { [`lastAttackOn.${missionData.defenderId}`]: serverTimestamp() });

                const getBonus = (user: UserProfile, type: 'attack' | 'defense' | 'resource') => {
                    const title = [...titles].reverse().find(t => (user.pride ?? 0) >= (t as any).prideRequired);
                    return title ? (title as any)[`${type}Bonus`] ?? 0 : 0;
                };

                const attackerTitleBonus = getBonus(attackerProfile, 'attack');
                const defenderTitleBonus = getBonus(defenderProfile, 'defense');

                const mobilityAttackBonusPerBuilding = gameSettings.effects.mobility?.attackBonus ?? 0;
                const fortDefenseBonusPerBuilding = gameSettings.effects.fort?.defenseBonus ?? 0;
                const universityEliteBonusPerBuilding = gameSettings.effects.university?.eliteBonus ?? 0;
                
                const attackerMobilityBonus = (attackerProfile.buildings?.mobility ?? 0) * mobilityAttackBonusPerBuilding;
                const defenderFortBonus = (defenderProfile.buildings?.fort ?? 0) * fortDefenseBonusPerBuilding;

                const attackerEliteBonus = (attackerProfile.buildings?.university ?? 0) * universityEliteBonusPerBuilding;
                const defenderEliteBonus = (defenderProfile.buildings?.university ?? 0) * universityEliteBonusPerBuilding;
                
                const totalAttackerBonus = attackerTitleBonus + attackerMobilityBonus;
                const totalDefenderBonus = defenderTitleBonus + defenderFortBonus;

                const attackerPower = 
                    (missionData.units.attack || 0) * 10 * (1 + totalAttackerBonus / 100) + 
                    (missionData.units.elite || 0) * 13 * (1 + (totalAttackerBonus + attackerEliteBonus) / 100) +
                    (missionData.units.raider || 0) * 2 * (1 + totalAttackerBonus / 100);

                const defenderPower = 
                    (defenderProfile.units.defense || 0) * 10 * (1 + totalDefenderBonus / 100) +
                    (defenderProfile.units.elite || 0) * 5 * (1 + (totalDefenderBonus + defenderEliteBonus) / 100);

                const powerRatio = attackerPower / (defenderPower || 1);

                let outcomeForAttacker: 'win' | 'loss';
                let attackerLossPercent = 0;
                let defenderLossPercent = 0;
                let landStolenPercent = 0;
                let prideStolenPercent = 0;

                if (powerRatio > 1.2) {
                    outcomeForAttacker = 'win';
                    attackerLossPercent = 0.1;
                    defenderLossPercent = 0.7;
                    landStolenPercent = 0.05; 
                    prideStolenPercent = 0.05;
                } else if (powerRatio > 1) {
                    outcomeForAttacker = 'win';
                    attackerLossPercent = 0.3;
                    defenderLossPercent = 0.5;
                    landStolenPercent = 0.02;
                    prideStolenPercent = 0.02;
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
                
                const resourcesPlundered = { money: 0, food: 0 };
                let landStolen = 0;
                let prideStolen = 0;
                
                if (outcomeForAttacker === 'win') {
                    landStolen = Math.floor(defenderProfile.land * landStolenPercent);
                    if (landStolen > 0) {
                        defenderUpdates['land'] = increment(-landStolen);
                    }
                    
                    prideStolen = Math.floor(defenderProfile.pride * prideStolenPercent);
                    if (prideStolen > 0) {
                        defenderUpdates['pride'] = increment(-prideStolen);
                    }

                    const plunderCapacity = (survivingAttackers.raider || 0) * 100;
                    const maxPlunderableMoney = defenderProfile.money * 0.1;
                    const maxPlunderableFood = defenderProfile.food * 0.1;
                    
                    const moneyPlundered = Math.min(maxPlunderableMoney, plunderCapacity / 2);
                    const foodPlundered = Math.min(maxPlunderableFood, plunderCapacity / 2);
                    
                    resourcesPlundered.money = Math.floor(moneyPlundered);
                    resourcesPlundered.food = Math.floor(foodPlundered);

                    if (resourcesPlundered.money > 0) defenderUpdates.money = increment(-resourcesPlundered.money);
                    if (resourcesPlundered.food > 0) defenderUpdates.food = increment(-resourcesPlundered.food);
                }
                
                if (Object.keys(defenderUpdates).length > 0) {
                    batch.update(defenderRef, defenderUpdates);
                }
                
                const travelTimeMinutes = 60; // 1 hour travel time
                const returnArrivalTime = Timestamp.fromMillis(Date.now() + travelTimeMinutes * 60 * 1000);
                const returnJobRef = doc(collection(db, "returnQueue"));
                batch.set(returnJobRef, {
                    userId: attackerProfile.uid,
                    survivingUnits: survivingAttackers,
                    plundered: { ...resourcesPlundered, land: landStolen, pride: prideStolen },
                    arrivalTime: returnArrivalTime
                });
                
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
                    landStolen,
                    prideStolen,
                    attackerPower: Math.floor(attackerPower),
                    defenderPower: Math.floor(defenderPower),
                    timestamp: serverTimestamp(),
                    readBy: { [attackerProfile.uid]: false, [defenderProfile.uid]: false }
                });

                batch.delete(missionDoc.ref);
                hasUpdate = true;
            } else {
                 batch.delete(missionDoc.ref);
                 hasUpdate = true;
            }
        }

    } catch (error) {
        console.error("Error processing mission queue:", error);
    }
    
    // --- Return Queue Logic ---
    try {
        const returnQuery = query(collection(db, 'returnQueue'), where('userId', '==', uid));
        const returnSnapshot = await getDocs(returnQuery);
        const returnsToProcess = returnSnapshot.docs.filter(doc => doc.data().arrivalTime.toDate() <= now.toDate());

        if (returnsToProcess.length > 0) {
            const updates: { [key: string]: any } = {};
            returnsToProcess.forEach(returnDoc => {
                const data = returnDoc.data();
                // Return surviving units
                for (const unit in data.survivingUnits) {
                    if (data.survivingUnits[unit] > 0) {
                        updates[`units.${unit}`] = increment(data.survivingUnits[unit]);
                    }
                }
                // Add plundered resources
                if (data.plundered?.money > 0) updates.money = increment(data.plundered.money);
                if (data.plundered?.food > 0) updates.food = increment(data.plundered.food);
                if (data.plundered?.land > 0) updates.land = increment(data.plundered.land);
                if (data.plundered?.pride > 0) updates.pride = increment(data.plundered.pride);

                batch.delete(returnDoc.ref);
            });
            batch.update(userDocRef, updates);
            hasUpdate = true;
        }
    } catch (error) {
        console.error("Error processing return queue:", error);
    }


    // --- Expired Wars Logic ---
    try {
        const expiredWarsQuery = query(collection(db, "wars"), where("expiresAt", "<=", now));
        const expiredWarsSnapshot = await getDocs(expiredWarsQuery);
        if (!expiredWarsSnapshot.empty) {
            expiredWarsSnapshot.forEach(warDoc => {
                batch.delete(warDoc.ref);
            });
            // No need to set hasUpdate here, this is a global cleanup
        }
    } catch (error) {
        console.error("Error processing expired wars:", error);
    }
    
    // --- Transport Queue Logic ---
    try {
        const transportQuery = query(collection(db, 'transportQueue'), where('recipientId', '==', uid));
        const transportSnapshot = await getDocs(transportQuery);
        const transportsToProcess = transportSnapshot.docs.filter(doc => doc.data().arrivalTime.toDate() <= now.toDate());

        if (transportsToProcess.length > 0) {
            const updates: { [key: string]: any } = {};
            transportsToProcess.forEach(transportDoc => {
                const data = transportDoc.data();
                if (data.type === 'resource') {
                    if (data.payload.money > 0) updates.money = increment(data.payload.money);
                    if (data.payload.food > 0) updates.food = increment(data.payload.food);
                } else if (data.type === 'troops') {
                    for (const unit in data.payload.units) {
                        if (data.payload.units[unit] > 0) {
                            updates[`units.${unit}`] = increment(data.payload.units[unit]);
                        }
                    }
                }
                batch.delete(transportDoc.ref);
            });
            batch.update(userDocRef, updates);
            hasUpdate = true;
        }
    } catch (error) {
        console.error("Error processing transport queue:", error);
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
  const { settings: gameSettings, isLoading: isLoadingSettings } = useGameSettings();
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
    if (!user || isLoadingSettings) {
      if (!user) setLoading(false);
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
              await processBackgroundTasksForUser(user.uid, initialProfile, gameSettings);
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
  }, [user, router, pathname, gameSettings, isLoadingSettings]);

  const value = { user, userProfile, loading };

  if ((loading || isLoadingSettings) && (pathname.startsWith('/userdashboard') || pathname.startsWith('/admindashboard'))) {
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
