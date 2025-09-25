
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, addDoc, serverTimestamp, increment, Timestamp, getDocs, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeftRight, Hourglass } from 'lucide-react';
import type { UserProfile } from '@/context/AuthContext';


interface Target {
  id: string;
  name: string;
  details: string;
  allianceId?: string;
  province?: string;
}

interface UnitCounts {
    attack: number;
    defense: number;
    elite: number;
    raider: number;
}

export default function CommandPage() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    const [targets, setTargets] = useState<Target[]>([]);
    const [isLoadingTargets, setIsLoadingTargets] = useState(true);

    const [selectedPlayerTarget, setSelectedPlayerTarget] = useState('');
    const [selectedWarTarget, setSelectedWarTarget] = useState('');

    const [playerAttackTroops, setPlayerAttackTroops] = useState<{ [key: string]: number }>({ attack: 0, defense: 0, elite: 0 });
    const [allianceAttackTroops, setAllianceAttackTroops] = useState<{ [key: string]: number }>({ attack: 0, defense: 0, elite: 0 });

    const [isAttackingPlayer, setIsAttackingPlayer] = useState(false);
    const [isAttackingAlliance, setIsAttackingAlliance] = useState(false);
    
    // State for war logic
    const [activeWars, setActiveWars] = useState<any[]>([]);
    const [enemyPrides, setEnemyPrides] = useState<Target[]>([]);
    const [isLoadingWarTargets, setIsLoadingWarTargets] = useState(true);


    // Fetch potential targets (players)
    useEffect(() => {
        if (!user) {
            setIsLoadingTargets(false);
            return;
        }
        setIsLoadingTargets(true);

        const usersQuery = query(collection(db, 'users'), where('uid', '!=', user.uid));
        
        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
            const userList = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.prideName || 'Unknown Pride',
                    details: data.province || 'Unknown Province',
                    province: data.province,
                    allianceId: data.allianceId,
                };
            });
            setTargets(userList);
            setIsLoadingTargets(false);
        }, (error) => {
            console.error("Error fetching targets: ", error);
            toast({ title: "Gagal memuat target", variant: "destructive" });
            setIsLoadingTargets(false);
        });

        return () => unsubscribe();
    }, [user, toast]);
    
    // Fetch active wars and enemy prides
    useEffect(() => {
        if (!userProfile?.allianceId) {
            setIsLoadingWarTargets(false);
            return;
        }

        setIsLoadingWarTargets(true);
        const warsQuery = query(collection(db, 'wars'), where('participants', 'array-contains', userProfile.allianceId));
        
        const unsubscribe = onSnapshot(warsQuery, async (snapshot) => {
            const warsData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            setActiveWars(warsData);

            if (warsData.length === 0) {
                setEnemyPrides([]);
                setIsLoadingWarTargets(false);
                return;
            }

            const enemyAllianceIds = warsData.flatMap(war => war.participants.filter((p: string) => p !== userProfile.allianceId));
            
            if (enemyAllianceIds.length > 0) {
                const enemyPridesQuery = query(collection(db, 'users'), where('allianceId', 'in', enemyAllianceIds));
                const enemySnapshot = await getDocs(enemyPridesQuery);
                const enemyList = enemySnapshot.docs.map(doc => {
                     const data = doc.data();
                     return {
                        id: doc.id,
                        name: data.prideName || 'Unknown Pride',
                        details: data.province || 'Unknown Province',
                        province: data.province,
                        allianceId: data.allianceId,
                    };
                });
                setEnemyPrides(enemyList);
            } else {
                setEnemyPrides([]);
            }
            setIsLoadingWarTargets(false);
        });

        return () => unsubscribe();

    }, [userProfile?.allianceId]);

    const isAtWar = activeWars.length > 0;

    const filteredPlayerTargets = useMemo(() => {
        if (!userProfile) return [];
        return targets.filter(target => {
            // Cannot attack own alliance members
            if (target.allianceId && target.allianceId === userProfile.allianceId) {
                return false;
            }
            // Cannot attack players in the same province
            if (target.province === userProfile.province) {
                return false;
            }
            return true;
        });
    }, [targets, userProfile]);

    const handleTroopInputChange = (setter: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>, unit: string, value: string) => {
        const amount = Number(value);
        if (!isNaN(amount) && amount >= 0) {
            setter(prev => ({...prev, [unit]: amount}));
        }
    };

    const handleMaxTroops = (setter: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>, unit: keyof UnitCounts) => {
        if (userProfile?.units) {
            setter(prev => ({...prev, [unit]: userProfile.units[unit] ?? 0}));
        }
    };
    
    const totalTroops = userProfile?.units 
        ? Object.values(userProfile.units).reduce((a, b) => a + b, 0) 
        : 0;

    const validateAttack = (troopOrder: { [key: string]: number }) => {
        if (!userProfile?.units) return "Profil tidak ditemukan.";

        let totalSent = 0;
        for (const unit in troopOrder) {
            const amount = troopOrder[unit];
            totalSent += amount;
            if (amount > (userProfile.units[unit as keyof UnitCounts] ?? 0)) {
                return `Anda tidak memiliki cukup pasukan ${unit}.`;
            }
        }
        if (totalSent === 0) {
            return "Anda harus mengirim setidaknya satu pasukan.";
        }
        return null;
    }

    const handlePlayerAttack = () => {
        if (!selectedPlayerTarget) {
            toast({ title: "Target tidak valid", description: "Silakan pilih pride untuk diserang.", variant: "destructive" });
            return;
        }

        const validationError = validateAttack(playerAttackTroops);
        if (validationError) {
            toast({ title: "Pasukan tidak valid", description: validationError, variant: "destructive" });
            return;
        }
        
        setIsAttackingPlayer(true);
        // Placeholder for attack logic
        setTimeout(() => {
            toast({
                title: "Logika Penyerangan Belum Diimplementasikan",
                description: "Ini adalah placeholder. Tidak ada serangan yang benar-benar terjadi."
            });
            setIsAttackingPlayer(false);
        }, 1500);
    };
    
    const handleAllianceAttack = () => {
         if (!selectedWarTarget) {
            toast({ title: "Target tidak valid", description: "Silakan pilih pride musuh untuk diserang.", variant: "destructive" });
            return;
        }

        const validationError = validateAttack(allianceAttackTroops);
        if (validationError) {
            toast({ title: "Pasukan tidak valid", description: validationError, variant: "destructive" });
            return;
        }

        setIsAttackingAlliance(true);
        // Placeholder for attack logic
        setTimeout(() => {
            toast({
                title: "Logika Penyerangan Aliansi Belum Diimplementasikan",
                description: "Ini adalah placeholder. Tidak ada serangan yang benar-benar terjadi."
            });
            setIsAttackingAlliance(false);
        }, 1500);
    }

    return (
        <div className="space-y-4">
            {/* Status Pasukan */}
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg">Status Pasukan</CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="flex justify-between border-r pr-4"><span>Serang:</span> <span>{(userProfile?.units?.attack ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between md:border-r pr-4"><span>Bertahan:</span> <span>{(userProfile?.units?.defense ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between border-r pr-4"><span>Elit:</span> <span>{(userProfile?.units?.elite ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between md:border-r pr-4"><span>Perampok:</span> <span>{(userProfile?.units?.raider ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Total:</span> <span>{totalTroops.toLocaleString()}</span></div>
                </CardContent>
            </Card>

            {/* Menyerang Pride Lain */}
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg text-accent">Serangan Reguler</CardTitle>
                    <CardDescription>Kirim pasukan untuk menyerang pemain di provinsi lain. Pasukan bertahan tidak bisa menyerang.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>Pilih Target Pride:</Label>
                            <Select onValueChange={setSelectedPlayerTarget} value={selectedPlayerTarget} disabled={isLoadingTargets}>
                                <SelectTrigger className="w-full bg-input/50">
                                    <SelectValue placeholder={isLoadingTargets ? "Memuat target..." : "-- Pilih Pride --"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredPlayerTargets.map(target => (
                                        <SelectItem key={target.id} value={target.id}>
                                            {target.name} [{target.details}]
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['attack', 'defense', 'elite'].map(unit => (
                            <div key={unit} className="space-y-1">
                                <Label className="capitalize">Pasukan {unit}</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        className="bg-input/50"
                                        value={playerAttackTroops[unit] || ''}
                                        onChange={e => handleTroopInputChange(setPlayerAttackTroops, unit, e.target.value)}
                                        min="0"
                                        max={userProfile?.units?.[unit as keyof UnitCounts] ?? 0}
                                    />
                                    <Button size="sm" variant="outline" onClick={() => handleMaxTroops(setPlayerAttackTroops, unit as keyof UnitCounts)}>Max</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={handlePlayerAttack} disabled={isAttackingPlayer}>
                        {isAttackingPlayer ? "Menyerang..." : "Serang Pride"}
                    </Button>
                </CardContent>
            </Card>
            
            {/* Menyerang Aliansi Lain */}
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg text-destructive">Serangan Perang</CardTitle>
                    <CardDescription>
                        {isAtWar 
                            ? "Aliansi Anda sedang berperang. Pilih target dari aliansi musuh untuk diserang."
                            : "Aliansi Anda sedang damai. Deklarasikan perang di halaman Aliansi untuk mengaktifkan serangan perang."
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>Pilih Target Pride Musuh:</Label>
                            <Select onValueChange={setSelectedWarTarget} value={selectedWarTarget} disabled={!isAtWar || isLoadingWarTargets}>
                                <SelectTrigger className="w-full bg-input/50" disabled={!isAtWar || isLoadingWarTargets}>
                                    <SelectValue placeholder={
                                        isLoadingWarTargets ? "Memuat target perang..." : 
                                        !isAtWar ? "Harus dalam kondisi perang" : 
                                        "-- Pilih Pride Musuh --"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {enemyPrides.map(target => (
                                        <SelectItem key={target.id} value={target.id}>
                                            {target.name} [{target.details}]
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         {['attack', 'defense', 'elite'].map(unit => (
                            <div key={unit} className="space-y-1">
                                <Label className="capitalize">Pasukan {unit}</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        className="bg-input/50"
                                        value={allianceAttackTroops[unit] || ''}
                                        onChange={e => handleTroopInputChange(setAllianceAttackTroops, unit, e.target.value)}
                                        min="0"
                                        max={userProfile?.units?.[unit as keyof UnitCounts] ?? 0}
                                        disabled={!isAtWar}
                                    />
                                    <Button size="sm" variant="outline" onClick={() => handleMaxTroops(setAllianceAttackTroops, unit as keyof UnitCounts)} disabled={!isAtWar}>Max</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button className="w-full" variant="destructive" onClick={handleAllianceAttack} disabled={isAttackingAlliance || !isAtWar}>
                        {isAttackingAlliance ? "Menyerang..." : "Serang Pride Musuh"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
