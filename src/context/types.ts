
import type { Timestamp } from 'firebase/firestore';

export interface BuildingCounts {
  residence: number;
  farm: number;
  fort: number;
  university: number;
  barracks: number;
  mobility: number;
  tambang: number;
}

export interface UnitCounts {
  attack: number;
  defense: number;
  elite: number;
  raider: number;
  spy: number;
}

export interface UserProfile {
  id: string; // id is the doc id, uid is the auth id
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
