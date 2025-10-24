
'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// --- Interfaces for Game Settings ---

export interface UnitCosts {
  attack: number;
  defense: number;
  elite: number;
  raider: number;
  spy: number;
}

export interface BuildingCosts {
  residence: number;
  farm: number;
  fort: number;
  university: number;
  barracks: number;
  mobility: number;
  tambang: number;
}

export interface Costs {
    units: UnitCosts;
    buildings: BuildingCosts;
}

export interface BuildingEffects {
  residence: { unemployed: number; capacity: number };
  farm: { unemployed: number; food: number };
  fort: { unemployed: number; defenseBonus: number };
  university: { unemployed: number; eliteBonus: number; constructionBonus: number };
  barracks: { unemployed: number; trainingBonus: number };
  mobility: { unemployed: number; attackBonus: number };
  tambang: { unemployed: number; money: number };
}

export interface BuildingCounts {
    residence: number; farm: number; fort: number; university: number;
    barracks: number; mobility: number; tambang: number;
}

export interface UnitCounts {
    attack: number; defense: number; elite: number; raider: number; spy: number;
}

export interface GameTitle {
  id: string;
  name: string;
  prideRequired: number;
  attackBonus: number;
  defenseBonus: number;
  resourceBonus: number;
}

export interface GameSettings {
    initialResources: {
        money: number;
        food: number;
        land: number;
        unemployed: number;
    };
    globalBonuses: {
        money: number;
        food: number;
    };
    costs: Costs;
    timing: {
        constructionTime: number;
        trainingTime: number;
    };
    effects: BuildingEffects;
    mechanics: {
        votingPowerDivisor: number;
    };
    adminMessage: string;
}

// Default state matching the structure
const defaultSettings: GameSettings = {
    initialResources: { money: 1000, food: 500, land: 100, unemployed: 10 },
    globalBonuses: { money: 100, food: 10 },
    costs: {
        units: { attack: 350, defense: 350, elite: 950, raider: 500, spy: 700 },
        buildings: { residence: 1000, farm: 1200, fort: 2500, university: 5000, barracks: 1500, mobility: 1000, tambang: 2000 }
    },
    timing: { constructionTime: 5, trainingTime: 2 },
    effects: {
        residence: { unemployed: 20, capacity: 500 },
        farm: { unemployed: 1, food: 100 },
        fort: { unemployed: 2, defenseBonus: 10 },
        university: { unemployed: 2, eliteBonus: 20, constructionBonus: 5 },
        barracks: { unemployed: 5, trainingBonus: 50 },
        mobility: { unemployed: 2, attackBonus: 50 },
        tambang: { unemployed: 2, money: 100 },
    },
    mechanics: { votingPowerDivisor: 100 },
    adminMessage: '',
};

interface GameSettingsContextType {
  settings: GameSettings;
  isLoading: boolean;
  setSettings: React.Dispatch<React.SetStateAction<GameSettings>>;
}

const GameSettingsContext = createContext<GameSettingsContextType>({
  settings: defaultSettings,
  isLoading: true,
  setSettings: () => {},
});

const SETTINGS_DOC_IDS = [
    'initial-resources',
    'global-bonuses',
    'game-costs',
    'timing-rules',
    'building-effects',
    'game-mechanics',
    'admin-info'
];


export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const handleDocUpdate = useCallback((docId: string, data: any) => {
    setSettings(prev => {
        const newSettings = { ...prev };
        switch(docId) {
            case 'initial-resources':
                newSettings.initialResources = data;
                break;
            case 'global-bonuses':
                newSettings.globalBonuses = data;
                break;
            case 'game-costs':
                newSettings.costs = data;
                break;
            case 'timing-rules':
                newSettings.timing = {
                    constructionTime: data.constructionTimeInHours,
                    trainingTime: data.trainingTimeInHours,
                };
                break;
            case 'building-effects':
                newSettings.effects = data;
                break;
            case 'game-mechanics':
                newSettings.mechanics = data;
                break;
            case 'admin-info':
                newSettings.adminMessage = data.message;
                break;
        }
        return newSettings;
    });
  }, []);


  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loadedCount = 0;

    SETTINGS_DOC_IDS.forEach(docId => {
        const docRef = doc(db, 'game-settings', docId);
        const unsubscribe = onSnapshot(docRef, 
            (docSnap) => {
                if (docSnap.exists()) {
                    handleDocUpdate(docId, docSnap.data());
                } else {
                    console.warn(`Game settings document not found: ${docId}`);
                }
                
                // Only stop loading when all documents have been attempted
                loadedCount++;
                if (loadedCount === SETTINGS_DOC_IDS.length) {
                    setIsLoading(false);
                }
            },
            (error) => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);

                console.error(`Failed to fetch '${docId}':`, error);
                
                loadedCount++;
                if (loadedCount === SETTINGS_DOC_IDS.length) {
                    setIsLoading(false);
                }
            }
        );
        unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [handleDocUpdate]);


  const value = { settings, isLoading, setSettings };

  return <GameSettingsContext.Provider value={value}>{children}</GameSettingsContext.Provider>;
}

export const useGameSettings = () => {
  const context = useContext(GameSettingsContext);
  if (context === undefined) {
    throw new Error('useGameSettings must be used within a GameSettingsProvider');
  }
  return context;
};
