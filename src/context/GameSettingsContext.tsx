
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

// Define the structure of your game settings
interface GameSettings {
  initialResources: { money: number; food: number; land: number; unemployed: number };
  globalBonuses: { money: number; food: number; };
  costs: {
    units: { attack: number; defense: number; elite: number; raider: number; spy: number; };
    buildings: { residence: number; farm: number; fort: number; university: number; barracks: number; mobility: number; tambang: number; };
  };
  timing: { constructionTime: number; trainingTime: number; };
  effects: {
    residence: { unemployed: number; capacity: number };
    farm: { unemployed: number; food: number };
    fort: { unemployed: number; defenseBonus: number };
    university: { unemployed: number; eliteBonus: number; constructionBonus: number };
    barracks: { unemployed: number; trainingBonus: number };
    mobility: { unemployed: number; attackBonus: number };
    tambang: { unemployed: number; money: number };
  };
  mechanics: { votingPowerDivisor: number; };
  adminInfo: { message: string; };
}

const defaultSettings: GameSettings = {
  initialResources: { money: 1000, food: 500, land: 100, unemployed: 10 },
  globalBonuses: { money: 100, food: 10 },
  costs: {
    units: { attack: 350, defense: 350, elite: 950, raider: 500, spy: 700 },
    buildings: { residence: 1000, farm: 1200, fort: 2500, university: 5000, barracks: 1500, mobility: 1000, tambang: 2000 },
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
  adminInfo: { message: '' },
};

const GameSettingsContext = createContext<{ settings: GameSettings; isLoading: boolean }>({
  settings: defaultSettings,
  isLoading: true,
});

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const settingDocs = [
        { name: 'initialResources', path: 'initial-resources' },
        { name: 'globalBonuses', path: 'global-bonuses' },
        { name: 'costs', path: 'game-costs' },
        { name: 'timing', path: 'timing-rules' },
        { name: 'effects', path: 'building-effects' },
        { name: 'mechanics', path: 'game-mechanics' },
        { name: 'adminInfo', path: 'admin-info' }
    ];

    const unsubscribes = settingDocs.map(({ name, path }) => {
        const docRef = doc(db, 'game-settings', path);
        return onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                 setSettings(prev => {
                    let newPartialSettings: any = {};
                    if (name === 'costs') {
                        newPartialSettings.costs = { units: data.units, buildings: data.buildings };
                    } else if (name === 'timing') {
                        newPartialSettings.timing = { constructionTime: data.constructionTimeInHours, trainingTime: data.trainingTimeInHours };
                    } else if (name === 'adminInfo') {
                        newPartialSettings.adminInfo = { message: data.message };
                    } else {
                        newPartialSettings[name] = data;
                    }
                    return { ...prev, ...newPartialSettings };
                });
            }
        }, (error) => {
            console.error(`Error fetching '${name}' settings:`, error);
        });
    });

    // A simple timeout to mark loading as false, allowing listeners to attach.
    // This is a pragmatic approach assuming settings will load quickly on a good connection.
    const timer = setTimeout(() => setIsLoading(false), 2000);

    return () => {
      unsubscribes.forEach(unsub => unsub());
      clearTimeout(timer);
    };
  }, []);

  return (
    <GameSettingsContext.Provider value={{ settings, isLoading }}>
      {children}
    </GameSettingsContext.Provider>
  );
}

export const useGameSettings = () => {
  return useContext(GameSettingsContext);
};
