
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
import { ArrowLeftRight, Hourglass, Eye } from 'lucide-react';
import type { UserProfile } from '@/context/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInSeconds } from 'date-fns';


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
    spy: number;
}

interface AttackJob {
    id: string;
    attackerName: string;
    defenderName: string;
    arrivalTime: Timestamp;
    type: 'attack' | 'spy';
}

const unitNameMap: { [key: string]: string } = {
  attack: 'Pasukan Serang',
  defense: 'Pasukan Bertahan',
  elite: 'Pasukan Elit',
  raider: 'Perampok',
  spy: 'Mata-mata'
};

function Countdown({ completionTime }: { completionTime: Timestamp }) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            const completion = completionTime.toDate();
            const secondsRemaining = differenceInSeconds(completion, now);

            if (secondsRemaining <= 0) {
                setTimeLeft('Tiba');
                clearInterval(timer);
            } else {
                const hours = Math.floor(secondsRemaining / 3600);
                const minutes = Math.floor((secondsRemaining % 3600) / 60);
                const seconds = secondsRemaining % 60;
                setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [completionTime]);

    return <span>{timeLeft}</span>;
}


export default function CommandPage() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    const [targets, setTargets] = useState<Target[]>([]);
    const [isLoadingTargets, setIsLoadingTargets] = useState(true);

    const [selectedPlayerTarget, setSelectedPlayerTarget] = useState('');
    const [selectedWarTarget, setSelectedWarTarget] = useState('');
    const [selectedSpyTarget, setSelectedSpyTarget] = useState('');

    const [playerAttackTroops, setPlayerAttackTroops] = useState<{ [key: string]: number }>({ attack: 0, defense: 0, elite: 0 });
    const [allianceAttackTroops, setAllianceAttackTroops] = useState<{ [key: string]: number }>({ attack: 0, defense: 0, elite: 0 });
    const [spyTroops, setSpyTroops] = useState<{ [key: string]: number }>({ spy: 0 });

    const [isAttackingPlayer, setIsAttackingPlayer] = useState(false);
    const [isAttackingAlliance, setIsAttackingAlliance] = useState(false);
    const [isSpying, setIsSpying] = useState(false);
    
    // State for war logic
    const [activeWars, setActiveWars] = useState<any[]>([]);
    const [enemyPrides, setEnemyPrides] = useState<Target[]>([]);
    const [isLoadingWarTargets, setIsLoadingWarTargets] = useState(true);
    
    // Attack queue state
    const [attackQueue, setAttackQueue] = useState<AttackJob[]>([]);
    const [isLoadingAttackQueue, setIsLoadingAttackQueue] = useState(true);


    // Fetch potential targets (players)
    useEffect(() => {
        if (!user) {
            setIsLoadingTargets(false);
            return;
        }
        setIsLoadingTargets(true);

        // Query for all users with the 'user' role
        const usersQuery = query(collection(db, 'users'), where('role', '==', 'user'));
        
        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
            const userList = snapshot.docs
                .filter(doc => doc.id !== user.uid) // Filter out the current user client-side
                .map(doc => {
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

    // Fetch attack queue
    useEffect(() => {
        if (!user) return;
        setIsLoadingAttackQueue(true);
        const q = query(collection(db, 'attackQueue'), where('attackerId', '==', user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttackJob));
            jobs.sort((a, b) => a.arrivalTime.toMillis() - b.arrivalTime.toMillis());
            setAttackQueue(jobs);
            setIsLoadingAttackQueue(false);
        }, (error) => {
            console.error("Error fetching attack queue:", error);
            toast({ title: "Gagal memuat antrian serangan", variant: "destructive" });
            setIsLoadingAttackQueue(false);
        });
        return () => unsubscribe();
    }, [user, toast]);

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
            if (amount < 0) return "Jumlah pasukan tidak boleh negatif.";
            totalSent += amount;
            if (amount > (userProfile.units[unit as keyof UnitCounts] ?? 0)) {
                return `Anda tidak memiliki cukup ${unitNameMap[unit] || unit}.`;
            }
        }
        if (totalSent === 0) {
            return "Anda harus mengirim setidaknya satu pasukan.";
        }
        return null;
    }

    const launchMission = async (targetId: string, troops: { [key: string]: number }, type: 'attack' | 'spy') => {
        if (!user || !userProfile) return;

        const target = [...targets, ...enemyPrides].find(t => t.id === targetId);
        if (!target) {
            toast({ title: "Target tidak ditemukan", variant: "destructive" });
            return;
        }

        const validationError = validateAttack(troops);
        if (validationError) {
            toast({ title: "Misi tidak valid", description: validationError, variant: "destructive" });
            return;
        }

        try {
            const batch = writeBatch(db);
            const userRef = doc(db, "users", user.uid);
            
            const troopUpdates: { [key: string]: any } = {};
            for (const unit in troops) {
                if (troops[unit] > 0) {
                    troopUpdates[`units.${unit}`] = increment(-troops[unit]);
                }
            }
            batch.update(userRef, troopUpdates);

            const travelTimeMinutes = 60; // 1 hour travel time
            const arrivalTime = Timestamp.fromMillis(Date.now() + travelTimeMinutes * 60 * 1000);

            const missionRef = doc(collection(db, "attackQueue"));
            batch.set(missionRef, {
                attackerId: user.uid,
                attackerName: userProfile.prideName,
                defenderId: targetId,
                defenderName: target.name,
                units: troops,
                arrivalTime: arrivalTime,
                type: type
            });
            
            // Add to activity log
            const logRef = doc(collection(db, "activityLog"));
            batch.set(logRef, {
                userId: user.uid,
                prideName: userProfile.prideName,
                type: type === 'attack' ? "attack" : "spy",
                message: `Melancarkan misi ${type === 'attack' ? 'serangan' : 'spionase'} ke ${target.name}.`,
                timestamp: serverTimestamp(),
            });

            await batch.commit();
            
            const missionTypeName = type === 'attack' ? 'Serangan' : 'Spionase';
            toast({ title: `${missionTypeName} Diluncurkan!`, description: `Pasukan Anda sedang bergerak menuju ${target.name}.` });

            if (type === 'attack') {
                if (isAttackingPlayer) setPlayerAttackTroops({ attack: 0, defense: 0, elite: 0 });
                if (isAttackingAlliance) setAllianceAttackTroops({ attack: 0, defense: 0, elite: 0 });
            } else if (type === 'spy') {
                setSpyTroops({ spy: 0 });
            }

        } catch (error) {
            console.error(`Error launching ${type}:`, error);
            toast({ title: `Gagal Melancarkan Misi`, description: "Terjadi kesalahan.", variant: "destructive" });
        } finally {
            if (type === 'attack') {
                setIsAttackingPlayer(false);
                setIsAttackingAlliance(false);
            }
            if (type === 'spy') setIsSpying(false);
        }
    };


    const handlePlayerAttack = () => {
        if (!selectedPlayerTarget) {
            toast({ title: "Target tidak valid", description: "Silakan pilih pride untuk diserang.", variant: "destructive" });
            return;
        }
        setIsAttackingPlayer(true);
        launchMission(selectedPlayerTarget, playerAttackTroops, 'attack');
    };
    
    const handleAllianceAttack = () => {
         if (!selectedWarTarget) {
            toast({ title: "Target tidak valid", description: "Silakan pilih pride musuh untuk diserang.", variant: "destructive" });
            return;
        }
        setIsAttackingAlliance(true);
        launchMission(selectedWarTarget, allianceAttackTroops, 'attack');
    }

    const handleSpyMission = () => {
        if (!selectedSpyTarget) {
            toast({ title: "Target tidak valid", description: "Silakan pilih pride untuk dimata-matai.", variant: "destructive" });
            return;
        }
        setIsSpying(true);
        launchMission(selectedSpyTarget, spyTroops, 'spy');
    };

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
                    <div className="flex justify-between"><span>Mata-mata:</span> <span>{(userProfile?.units?.spy ?? 0).toLocaleString()}</span></div>
                </CardContent>
            </Card>

            <Tabs defaultValue="attack">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="attack">Serangan Reguler</TabsTrigger>
                    <TabsTrigger value="war">Serangan Perang</TabsTrigger>
                    <TabsTrigger value="spy">Spionase</TabsTrigger>
                </TabsList>
                <TabsContent value="attack">
                    <Card>
                        <CardHeader className="p-4">
                            <CardTitle className="text-lg text-accent">Serangan Reguler</CardTitle>
                            <CardDescription>Kirim pasukan untuk menyerang pemain di provinsi lain. Pasukan bertahan tidak bisa menyerang.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
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
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {['attack', 'elite', 'raider'].map(unit => (
                                    <div key={unit} className="space-y-1">
                                        <Label className="capitalize">{unitNameMap[unit]}</Label>
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
                </TabsContent>
                <TabsContent value="war">
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 {['attack', 'elite', 'raider'].map(unit => (
                                    <div key={unit} className="space-y-1">
                                        <Label className="capitalize">{unitNameMap[unit]}</Label>
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
                </TabsContent>
                <TabsContent value="spy">
                     <Card>
                        <CardHeader className="p-4">
                            <CardTitle className="text-lg text-blue-500">Spionase</CardTitle>
                            <CardDescription>Kirim mata-mata untuk mengumpulkan intelijen tentang target Anda. Hasilnya akan muncul di Laporan.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-1">
                                <Label>Pilih Target Spionase:</Label>
                                <Select onValueChange={setSelectedSpyTarget} value={selectedSpyTarget} disabled={isLoadingTargets}>
                                    <SelectTrigger className="w-full bg-input/50">
                                        <SelectValue placeholder={isLoadingTargets ? "Memuat target..." : "-- Pilih Pride --"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {targets.map(target => (
                                            <SelectItem key={target.id} value={target.id}>
                                                {target.name} [{target.details}]
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <Label className="capitalize">{unitNameMap['spy']}</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            className="bg-input/50"
                                            value={spyTroops['spy'] || ''}
                                            onChange={e => handleTroopInputChange(setSpyTroops, 'spy', e.target.value)}
                                            min="0"
                                            max={userProfile?.units?.spy ?? 0}
                                        />
                                        <Button size="sm" variant="outline" onClick={() => handleMaxTroops(setSpyTroops, 'spy')}>Max</Button>
                                    </div>
                                </div>
                            </div>
                            <Button className="w-full" variant="secondary" onClick={handleSpyMission} disabled={isSpying}>
                                {isSpying ? "Mengirim Mata-mata..." : "Kirim Mata-mata"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Attack Queue */}
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-lg">Antrian Misi</CardTitle>
                    <CardDescription>Pasukan Anda yang sedang dalam perjalanan.</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                    {isLoadingAttackQueue ? (
                        <p className="text-sm text-muted-foreground text-center">Memuat antrian...</p>
                    ) : attackQueue.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Misi</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead className="text-right">Tiba Dalam</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {attackQueue.map(job => (
                                    <TableRow key={job.id}>
                                        <TableCell className="capitalize flex items-center gap-2">
                                            {job.type === 'attack' ? <ArrowLeftRight className="h-4 w-4 text-destructive" /> : <Eye className="h-4 w-4 text-blue-500" />}
                                            {job.type}
                                        </TableCell>
                                        <TableCell>{job.defenderName}</TableCell>
                                        <TableCell className="text-right">
                                            <Countdown completionTime={job.arrivalTime} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center">Tidak ada pasukan yang sedang dalam misi.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

    