
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';

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

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only fetch settings if a user is logged in
    if (!user) {
        setIsLoading(false);
        // Optionally reset to default settings on logout
        // setSettings(defaultSettings); 
        return;
    }

    const fetchGameSettings = async () => {
      setIsLoading(true);
      try {
        const settingsCollectionRef = collection(db, 'game-settings');
        const snapshot = await getDocs(settingsCollectionRef);
        const fetchedSettings: Partial<GameSettings> = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            switch (doc.id) {
                case 'initial-resources':
                    fetchedSettings.initialResources = data as GameSettings['initialResources'];
                    break;
                case 'global-bonuses':
                    fetchedSettings.globalBonuses = data as GameSettings['globalBonuses'];
                    break;
                case 'game-costs':
                    fetchedSettings.costs = data as GameSettings['costs'];
                    break;
                case 'timing-rules':
                    fetchedSettings.timing = {
                        constructionTime: data.constructionTimeInHours,
                        trainingTime: data.trainingTimeInHours,
                    };
                    break;
                case 'building-effects':
                    fetchedSettings.effects = data as GameSettings['effects'];
                    break;
                case 'game-mechanics':
                    fetchedSettings.mechanics = data as GameSettings['mechanics'];
                    break;
                case 'admin-info':
                    fetchedSettings.adminMessage = data.message as GameSettings['adminMessage'];
                    break;
            }
        });
        
        // Merge fetched settings with defaults to ensure all keys are present
        setSettings(prev => ({
            ...prev,
            ...fetchedSettings
        }));
        
      } catch (error) {
        console.error("Failed to fetch game settings:", error);
        // In case of error, we can rely on the default settings
      } finally {
        setIsLoading(false);
      }
    };

    fetchGameSettings();
  }, [user]);

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
